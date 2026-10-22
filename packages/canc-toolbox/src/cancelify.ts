import { CancelablePromise, CancelError, ICancelablePromiseOptions, isCancelError } from '@cancjs/promise';

import { createCancelSignalSource } from '../../_toolbox';
import { setFnName } from '../../_util';
import { IExecutorCtx, THandleCancel } from './options';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
type AbortControllerCtor = new () => { abort(reason?: any): void; signal: any };

/**
 * Normalize an arbitrary cancel reason into a branded CancelError, matching cancel() and the core
 * createCancelSignal: a CancelError passes through unwrapped, a string/undefined becomes the message,
 * any other object becomes the cause. This keeps an aborted outbound signal reading as a genuine
 * cancellation end-to-end (spec consumers reject with signal.reason, which is our CancelError).
 * Passed to the outbound signal source as the reason normalizer so an aborted signal reads branded.
 */
export function toCancelError(reason?: unknown): CancelError {
  if (isCancelError(reason)) {
    return reason;
  }

  if (reason !== null && typeof reason === 'object') {
    return new CancelError(undefined, { cause: reason });
  }

  return new CancelError(reason as string | undefined);
}

export interface ICancelifyContext {
  /**
   * Get the outbound signal, creating the controller on first call. A first call after the promise
   * was canceled returns an already aborted signal.
   * @deprecated Use `signal`.
   */
  getSignal: () => any;
  handleCancel: THandleCancel;
  /**
   * The outbound signal `getSignal()` returns, created on first read. The property is an inherited
   * non-enumerable getter, so spread and `JSON.stringify` neither copy it nor create the
   * controller. Destructuring it (`({ signal }, ...args) => ...`) reads it once.
   */
  readonly signal: any;
}

// a plain constructor so every context shares one map and inherits the signal getter
const CancelifyContext = function CancelifyContext(
  this: ICancelifyContext,
  getSignal: () => any,
  handleCancel: THandleCancel,
) {
  this.getSignal = getSignal;
  this.handleCancel = handleCancel;
} as unknown as new (getSignal: () => any, handleCancel: THandleCancel) => ICancelifyContext;

Object.defineProperty(CancelifyContext.prototype, 'signal', {
  configurable: true,
  get: function (this: ICancelifyContext): any {
    return this.getSignal();
  },
});

export interface ICancelifyOptions extends ICancelablePromiseOptions {
  /** AbortController implementation used to mint the outbound signal. Defaults to the ambient global. */
  AbortController?: AbortControllerCtor;
  /** Overrides the generated `cancelify: <name>` displayName verbatim. */
  displayName?: string;
}

function withInjectedController(ctx: IExecutorCtx, Ctor: AbortControllerCtor): ICancelifyContext {
  const source = createCancelSignalSource(Ctor, toCancelError);
  ctx.handleCancel(source.onCancel);
  return new CancelifyContext(source.getSignal, ctx.handleCancel);
}

/** A promise-returning fn that receives the cancel context and the call arguments. Read `signal`
 * only when the underlying API needs a signal; ignoring it allocates nothing. */
export type TCancelifyFn<A extends any[], R> = (ctx: ICancelifyContext, ...args: A) => R | PromiseLike<R>;

/**
 * Add cancellation to an already-promise-returning fn by handing it an outbound signal that aborts
 * when the returned promise is canceled. The result is always a CancelablePromise; reading
 * `signal` inside fn materializes the controller, while a fn that never reads it constructs nothing.
 */
export function cancelify<A extends any[], R>(
  fn: TCancelifyFn<A, R>,
  options?: ICancelifyOptions,
): (...callArgs: A) => CancelablePromise<R> {
  const Ctor = options?.AbortController;

  const wrapper = function (...callArgs: A): CancelablePromise<R> {
    const run = (resolve: (value: R | PromiseLike<R>) => void, reject: (reason?: any) => void, ctx?: IExecutorCtx) => {
      // the core context already carries a late-safe signal; only an injected controller needs ours
      const context = Ctor ? withInjectedController(ctx!, Ctor) : (ctx as unknown as ICancelifyContext);
      CancelablePromise.resolve(fn(context, ...callArgs)).then(resolve, reject);
    };

    return new CancelablePromise<R>(run, options);
  };

  return setFnName(wrapper, 'cancelify', fn, options?.displayName);
}
