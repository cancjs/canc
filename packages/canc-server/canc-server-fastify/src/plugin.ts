import { isCancelError } from '@cancjs/promise';
import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
  preParsingHookHandler,
  RequestPayload,
} from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import {
  checkAnswerStatus,
  isResponseLive,
  isUnanswerable,
  ownedStatusOf,
  toRequestLike,
} from '../../../_server/exchange';
import { getRequestRegistry, getRequestState } from '../../../_server/holder';
import { ensureRequestCancelState } from '../../../_server/node-signal';
import { checkTimeoutOptions } from '../../../_server/timeout';
import { ICancelableHandlerOptions } from '../../../_server/types';
import { TAnyFn } from '../../../_util';
import { cancelableHandler, cancelableHook, cancelablePreParsing, TFastifyRouteHandler } from './handler';
import { installCloseDrain } from './shutdown';

/** What an error handler does with a cancellation the wrapper forwarded. */
export interface ICancelErrorHandlerOptions {
  /** Status sent when a cancellation surfaces on a live connection. Defaults to 503. */
  status?: number;
  /**
   * Answers an error that is not a cancellation, in place of fastify's own `reply.send(error)`. Set it
   * when the app's own error mapping lives in the same handler. Cancellations do not reach it: the
   * request's own cancel is answered with its status, and any other cancel goes to fastify as it is.
   * Returned synchronous or asynchronous results and rejections are forwarded to fastify.
   */
  onError?: (error: unknown, request: FastifyRequest, reply: FastifyReply) => void;
}

/** The shape `fastify.setErrorHandler` accepts. */
export type TCancelErrorHandler = (
  this: FastifyInstance,
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) => void;

/** Options accepted by `cancelPlugin`: request defaults and the plugin's own switches. */
export interface ICancelPluginOptions extends ICancelableHandlerOptions {
  /**
   * Drives synchronous generator results from route handlers and route-level request hooks.
   * Only routes registered after the plugin are seen. Defaults to true.
   */
  autoWrap?: boolean;
}

// route-level request hooks use one wrapper; preParsing has its own payload contract
const REQUEST_HOOKS = ['onRequest', 'preValidation', 'preHandler'] as const;

// Check the protocol without reading accessors or advancing an iterator. ES5 generators have
// own data methods; native generators inherit them. Ordinary iterators lack throw and return.
function hasDataMethod(value: object, key: PropertyKey): boolean {
  try {
    for (
      let cursor: object | null = value;
      cursor !== null && cursor !== Object.prototype;
      cursor = Object.getPrototypeOf(cursor)
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);

      if (descriptor) {
        return typeof descriptor.value === 'function';
      }
    }
  } catch {
    // A proxy may refuse introspection; leave its result to Fastify.
  }

  return false;
}

function isFastifyGeneratorResult(value: unknown): value is Generator {
  return (
    value !== null &&
    typeof value === 'object' &&
    hasDataMethod(value, 'next') &&
    hasDataMethod(value, 'throw') &&
    hasDataMethod(value, 'return') &&
    hasDataMethod(value, Symbol.iterator)
  );
}

// Invoke a bare route once, even when its request is already canceled. Only the captured
// generator is handed to the explicit wrapper, whose pre-abort check prevents its first step.
function wrapRoute(original: TAnyFn): TFastifyRouteHandler {
  return function (this: FastifyInstance, _request: FastifyRequest, _reply: FastifyReply) {
    // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments
    const result: unknown = original.apply(this, arguments as unknown as Parameters<TAnyFn>);

    if (!isFastifyGeneratorResult(result)) {
      return result;
    }

    // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments
    return cancelableHandler(() => result).apply(this, arguments as unknown as [FastifyRequest, FastifyReply]);
  };
}

// Callback hooks must not both return a promise and call done. Preserve Fastify's arity and
// actual arguments for the original function, and only drive a returned generator.
function wrapRequestHook(original: TAnyFn): TAnyFn {
  if (original.length >= 3) {
    return function (
      this: FastifyInstance,
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ) {
      // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments
      const result: unknown = original.apply(this, arguments as unknown as Parameters<TAnyFn>);

      if (!isFastifyGeneratorResult(result)) {
        return result;
      }

      void Promise.resolve(cancelableHook(() => result).call(this, request, reply)).then(() => done(), done);
    };
  }

  return function (this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments
    const result: unknown = original.apply(this, arguments as unknown as Parameters<TAnyFn>);

    return isFastifyGeneratorResult(result) ? cancelableHook(() => result).call(this, request, reply) : result;
  };
}

function wrapPreParsing(original: TAnyFn): TAnyFn {
  if (original.length >= 4) {
    return function (
      this: FastifyInstance,
      request: FastifyRequest,
      reply: FastifyReply,
      payload: RequestPayload,
      done: Parameters<preParsingHookHandler>[3],
    ) {
      // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments
      const result: unknown = original.apply(this, arguments as unknown as Parameters<TAnyFn>);

      if (!isFastifyGeneratorResult(result)) {
        return result;
      }

      void Promise.resolve(cancelablePreParsing(() => result).call(this, request, reply, payload)).then(
        (value) => done(null, value as RequestPayload | undefined),
        done,
      );
    };
  }

  return function (this: FastifyInstance, request: FastifyRequest, reply: FastifyReply, payload: RequestPayload) {
    // eslint-disable-next-line prefer-rest-params -- preserve Fastify arity and forward the actual arguments
    const result: unknown = original.apply(this, arguments as unknown as Parameters<TAnyFn>);

    return isFastifyGeneratorResult(result) ?
        cancelablePreParsing(() => result).call(this, request, reply, payload)
      : result;
  };
}

const plugin: FastifyPluginAsync<ICancelPluginOptions> = async function cancelPlugin(fastify, pluginOptions) {
  checkTimeoutOptions(pluginOptions.timeout);
  const { autoWrap, ...options } = pluginOptions;
  // the instance holds its server from the start, so a shutdown knows every request, plain ones too
  getRequestRegistry(fastify.server, true);
  installCloseDrain(fastify);

  fastify.addHook('onRoute', (route) => {
    if (autoWrap === false) {
      return;
    }

    route.handler = wrapRoute(route.handler);

    const hooks = route as unknown as Record<string, unknown>;
    const wrapEach = (name: string, wrap: (hook: TAnyFn) => TAnyFn, callbackArity: number) => {
      const value = hooks[name];

      if (Array.isArray(value)) {
        // Fastify validates hook arrays after onRoute. Keep invalid async callback signatures
        // visible to its own validator rather than hiding them behind a synchronous wrapper.
        hooks[name] = value.map((hook: unknown) =>
          typeof hook === 'function' && !(hook.constructor.name === 'AsyncFunction' && hook.length === callbackArity) ?
            wrap(hook as TAnyFn)
          : hook,
        );
      } else if (typeof value === 'function') {
        hooks[name] = wrap(value as TAnyFn);
      }
    };

    for (const name of REQUEST_HOOKS) {
      wrapEach(name, wrapRequestHook, 3);
    }
    wrapEach('preParsing', wrapPreParsing, 4);
  });

  // onRequest is the earliest hook, so the signal exists before body parsing and before any
  // request-scoped work a later hook starts
  fastify.addHook('onRequest', (request, reply, done) => {
    ensureRequestCancelState(request.raw, reply.raw, options);
    done();
  });

  return Promise.resolve();
};

/**
 * Installs the per-request cancel signal for every route, and supplies the options each wrapped
 * handler inherits.
 *
 * Registered options are defaults: a route passing its own to `cancelableHandler` wins on every key
 * it sets. A registered deadline starts at `onRequest` and reaches plain routes too, where it aborts the request signal and runs
 * `onTimeout` while the route itself still answers; a route passing
 * its own `timeout` restarts it. It ends when the response closes, or once the wrapped route handler
 * settles, so a body streamed after the handler returned is not cut short. The lifecycle callbacks
 * run once per request, however many wrapped hooks it passes. Nothing is decorated onto the request
 * or the instance, so no module augmentation is needed to use this.
 *
 * With `autoWrap`, on by default, native or ES5-transpiled synchronous generator results from a
 * route handler or route-level `onRequest`, `preParsing`, `preValidation` or `preHandler` hook are
 * driven after the original function is invoked. Plain results and callbacks retain native
 * behavior. Earlier routes and hooks added with `addHook` are not seen.
 *
 * It also registers a `preClose` hook that drains the server inside fastify's own close, so a plain
 * `await app.close()` lets in-flight requests finish and cancels the rest, with the options given
 * to `createShutdown` or the defaults. Register it after plugins whose `preClose` hooks end
 * long-lived connections: hooks run in registration order.
 */
export const cancelPlugin = fastifyPlugin(plugin, {
  fastify: '>=5.0.0',
  name: '@cancjs/server-fastify',
});

/**
 * An error handler that finishes what the wrapper deliberately left alone.
 *
 * A cancellation that arrives on a response which can no longer be answered is dropped. A
 * cancellation on a live connection answers with a status. Everything else, a missed deadline
 * included, goes to fastify's own handling, which reads the status off the error, unless `onError`
 * takes the non-cancellation errors.
 *
 * Not needed on wrapped routes: fastify answers a request's own cancellation with its status by
 * itself, so this is for an app that wants its own error mapping alongside that answer.
 */
export function cancelErrorHandler(options?: ICancelErrorHandlerOptions): TCancelErrorHandler {
  const configured = options?.status;

  checkAnswerStatus(configured);
  const onError = options?.onError;

  return function cancelAwareErrorHandler(error, request, reply) {
    if (isUnanswerable(error, reply.raw)) {
      reply.hijack();

      return;
    }

    // a head already sent cannot take a status, so the socket is cut instead of left looking whole.
    // The client sees only a reset, so the cut is logged once here.
    if (isCancelError(error) && reply.raw.headersSent) {
      // a response that finished on its own is not a cut, so there is nothing to log
      if (isResponseLive(reply.raw)) {
        request.log.error(error);
      }

      reply.raw.destroy();
      reply.hijack();

      return;
    }

    if (onError && !isCancelError(error)) {
      return onError(error, request, reply);
    }

    // a cancellation the request does not own is the caller's, so fastify's own handling takes it
    const state = getRequestState(toRequestLike(request.raw));
    const code = isCancelError(error) && state !== undefined ? ownedStatusOf(error, state, configured) : undefined;

    if (code !== undefined) {
      // fastify reads status then statusCode off the error, so stamping it is all the mapping a
      // shutdown cancellation needs
      (error as { status?: number; statusCode?: number }).status = code;
      (error as { statusCode?: number }).statusCode = code;
    }

    reply.send(error);
  };
}
