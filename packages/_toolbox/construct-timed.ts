import { construct, TExecutor } from './construct';
import { IToolboxDeps, TLazyOf } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/** The one field this module reads off an options bag; every other key is opaque to it. */
interface ILazyOption {
  lazy?: boolean;
}

/**
 * Route a timed/control helper's construction through the flavor's lazy promise when
 * `options.lazy` is set, or through the normal eager `construct` otherwise. This is the single
 * branch point `delay`, `timeout`, `retry`, `waitFor` and `promisify` call instead of `construct`
 * directly, so `{ lazy: true }` support lives in one place rather than being reimplemented per
 * helper. `minDelay`, `defer`, `debounce` and `throttle` keep calling `construct` unchanged and do
 * not read `options.lazy`.
 *
 * The lazy result is the same as `LazyPromise.try(() => helper(...))` with the options applied to
 * the work. It is built against `deps.Impl`, the same implementation the eager result uses.
 */
export function constructTimed<T, K extends IPromiseKind = IPromiseLikeKind, F = never>(
  deps: IToolboxDeps<K>,
  executor: TExecutor<T>,
  options?: object,
): TPromiseOf<K, T, F> | TLazyOf<K, T, F> {
  if ((options as ILazyOption | undefined)?.lazy !== true) {
    return construct<T, K, F>(deps.Impl, executor, options);
  }

  const Lazy = deps.Lazy;

  if (!Lazy) {
    throw new TypeError('The lazy option needs a lazy promise class');
  }

  return new Lazy((resolve, reject, handleCancel) => executor(resolve, reject, { handleCancel }), {
    ...options,
    impl: deps.Impl,
  }) as TLazyOf<K, T, F>;
}
