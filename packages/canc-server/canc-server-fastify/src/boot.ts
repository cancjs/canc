import { cancAsync } from '@cancjs/coroutine';
import { CancelablePromise, CancelError, makeCancelable, resolvePromiseImpl, TimeoutError } from '@cancjs/promise';
import { FastifyInstance, FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { THandlerFn } from '../../../_server/types';
import { isGenerator, isThenable } from '../../../_util';
import { getBootScope } from './shutdown';

// Observing the task through its own then would count as a consumer.
const NativePromise = Promise;

export interface ICancelablePluginOptions {
  /**
   * Milliseconds the plugin body may run before it is canceled. Defaults to just under the
   * instance's pluginTimeout, so the cancel lands while fastify is still waiting for the plugin;
   * no limit when pluginTimeout is 0. Infinity sets no limit. A nested plugin gets less time
   * from fastify than its parent, so pass its budget here.
   */
  timeout?: number;
  /** Signals that also cancel the boot, such as the one given to listen({ signal }). */
  signal?: AbortSignal | AbortSignal[];
}

export type TCancelablePluginFn<Options extends FastifyPluginOptions = Record<never, never>> = THandlerFn<
  (this: FastifyInstance, instance: FastifyInstance, options: Options) => unknown
>;

/**
 * Runs a fastify plugin under a shared server boot cancel scope. A generator stops at its next
 * yield and runs its finally blocks; a plain function runs signal-only. A cancelable promise
 * returned by either form is canceled. Works with fastify-plugin.
 *
 * A deadline, a given signal, or shutdown() from createShutdown can cancel the boot. Deadline
 * errors are CancelError instances carrying FST_ERR_PLUGIN_TIMEOUT for err.code checks; they
 * are not instances of fastify's timeout error class. A plain app.close() during boot still waits
 * for startup to finish, so use shutdown() or a signal to stop an unfinished plugin.
 */
export function cancelablePlugin<Options extends FastifyPluginOptions = Record<never, never>>(
  plugin: TCancelablePluginFn<Options>,
  options?: ICancelablePluginOptions,
): FastifyPluginAsync<Options> {
  if (typeof plugin !== 'function') {
    throw new TypeError(`cancelablePlugin() needs the plugin function as its first argument, got ${typeof plugin}.`);
  }

  if (options?.timeout !== undefined && (typeof options.timeout !== 'number' || !(options.timeout > 0))) {
    throw new RangeError(`timeout (${options.timeout}) must be a positive number of milliseconds or Infinity`);
  }

  const name = plugin.name || 'anonymous';
  const callerSignals =
    options?.signal ?
      Array.isArray(options.signal) ?
        options.signal
      : [options.signal]
    : [];

  const cancelableBoot = function (this: FastifyInstance, instance: FastifyInstance, opts: Options): Promise<void> {
    const scope = getBootScope(instance.server);
    const signals: AbortSignal[] = [scope.signal, ...callerSignals];
    const Impl = resolvePromiseImpl() as unknown as typeof CancelablePromise;
    const alreadyAborted = signals.find((signal) => signal.aborted);

    if (alreadyAborted) {
      const { cancel, promise } = Impl.withResolvers<void>();
      cancel(alreadyAborted.reason);

      return promise;
    }

    let result: unknown;
    try {
      result = (plugin as (this: FastifyInstance, instance: FastifyInstance, opts: Options) => unknown).call(
        instance,
        instance,
        opts,
      );
    } catch (error) {
      return Impl.reject(error);
    }

    const task =
      isGenerator(result) ?
        cancAsync(() => result, undefined, { signal: signals })()
      : makeCancelable(isThenable(result) ? result : Impl.resolve(result), { signal: signals });

    const ms = options?.timeout ?? defaultBootTimeout(instance);
    if (ms !== Infinity) {
      const timer = setTimeout(
        () => {
          const error = new CancelError(`plugin ${name} did not finish booting within ${ms} ms`, {
            cause: new TimeoutError(`plugin ${name} timed out`),
          });
          (error as CancelError & { code?: string }).code = 'FST_ERR_PLUGIN_TIMEOUT';
          task.cancel(error);
        },
        Math.min(ms, 2_147_483_647),
      );

      const clear = () => clearTimeout(timer);
      void NativePromise.prototype.then.call(task, clear, clear);
    }

    return task as Promise<void>;
  };

  Object.defineProperty(cancelableBoot, 'name', { configurable: true, value: name });

  return cancelableBoot as FastifyPluginAsync<Options>;
}

function defaultBootTimeout(instance: FastifyInstance): number {
  const limit = instance.initialConfig.pluginTimeout;
  if (typeof limit !== 'number' || !(limit > 0) || !Number.isFinite(limit)) {
    return Infinity;
  }

  return limit - Math.max(1, Math.min(500, Math.floor(limit / 10)));
}
