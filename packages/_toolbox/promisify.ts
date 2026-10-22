import { setFnName } from '../_util';
import { IAbortSignalLike } from './abort-signal';
import { NO_SIGNAL, TGetSignal, withSignalAccessor } from './cancel-signal';
import { IExecutorCtx } from './construct';
import { constructTimed } from './construct-timed';
import { ILazyOn, IToolboxDeps, TAbortControllerCtor, TLazyOf } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/** The registered promisify.custom symbol, referenced via Symbol.for to avoid importing node:util. */
const kCustom = Symbol.for('nodejs.util.promisify.custom');

/** A callback-style function whose last argument is a node-style callback. */
export type TCallbackFn = (...args: any[]) => any;

export interface IPromisifyOptions {
  /** Node errfirst callback (default true) vs a value-first callback. */
  errorFirst?: boolean;
  /**
   * Resolve more than the single callback value. `true` resolves the array of post-error callback
   * arguments; a string[] resolves an object keyed by those names (node's argumentNames parity).
   */
  multiArgs?: boolean | string[];
  /** Honor a function's Symbol.for('nodejs.util.promisify.custom') implementation. Default true. */
  custom?: boolean;
  /**
   * Invoke-time hook: normalize the call args and/or place the outbound cancel signal for
   * signal-aware callback APIs. `getSignal()` materializes the signal on first call (undefined
   * when `Impl` is not cancelable-shaped); a hook that never calls it allocates no controller.
   * `getSignal.signal` reads the same signal, so `(args, { signal }) => ...` works too. The
   * property is installed when the hook declares a second parameter (or rest/no parameters), or
   * when its source text mentions `signal`, `arguments` or `...` (meant for a rest parameter,
   * though a spread matches too). That check is best-effort and runs once per `promisify()` call. It misses a hook that reads the property under a computed
   * or aliased name, and a bound or native function (its source is `[native code]`), which fall back
   * to the parameter count. A minifier keeps destructured keys but may rename the property read
   * behind an alias. When in doubt, call `getSignal()` instead.
   */
  transformArgs?: (args: any[], getSignal: TGetSignal) => any[];
  /**
   * Cancel-time teardown hook. `handle` is the synchronous return value of the underlying call
   * (e.g. a ClientRequest or ChildProcess), so the hook can stop the work imperatively.
   * `getSignal()` returns the outbound signal, already aborted by the time the hook runs (undefined
   * when `Impl` is not cancelable-shaped).
   */
  handleCancel?: (handle: any, args: any[], getSignal: TGetSignal, reason?: any) => void;
  /** AbortController implementation used to mint the outbound signal. Defaults to the ambient global. */
  AbortController?: TAbortControllerCtor;
  /** Defer calling the underlying callback function until the first subscription. Not contagious past a chained `.then`. */
  lazy?: boolean;
  /** Overrides the generated `promisify: <name>` displayName verbatim. */
  displayName?: string;
  /**
   * Forwarded to the CancelablePromise; caller inbound signal, distinct from the outbound signal
   * minted by getSignal().
   */
  signal?: IAbortSignalLike | IAbortSignalLike[];
  [key: string]: unknown;
}

/** Whether a hook can see its `position`-th (1-based) argument: declared, or reachable via rest/`arguments`. */
function declaresParam(hook: (...args: any[]) => unknown, position: number): boolean {
  return hook.length === 0 || hook.length >= position;
}

const SIGNAL_SOURCE = /\bsignal\b|\barguments\b|\.\.\./;
const NATIVE_SOURCE = /\{\s*\[native code\]\s*\}\s*$/;

/** Best-effort read of a hook's source; unknown (throwing or native) source counts as no mention. */
function mentionsSignal(hook: (...args: any[]) => unknown): boolean {
  let source: string;
  try {
    source = Function.prototype.toString.call(hook);
  } catch (_error) {
    return false;
  }
  return !NATIVE_SOURCE.test(source) && SIGNAL_SOURCE.test(source);
}

/** Whether a hook may read `getSignal.signal`, decided once per promisify() call. */
function mayReadSignal(hook: ((...args: any[]) => unknown) | undefined, position: number): boolean {
  return !!hook && (declaresParam(hook, position) || mentionsSignal(hook));
}

/** Resolve the callback result into the resolved value per errorFirst / multiArgs. */
function settleFromCallback(
  cbArgs: any[],
  errorFirst: boolean,
  multiArgs: boolean | string[] | undefined,
  resolve: (value: any) => void,
  reject: (reason?: any) => void,
): void {
  if (errorFirst) {
    const err: unknown = cbArgs[0];
    if (err) {
      reject(err);
      return;
    }
    const values = cbArgs.slice(1);
    resolve(mapValues(values, multiArgs));
    return;
  }

  // Value-first: no error slot, every arg is a value.
  resolve(mapValues(cbArgs, multiArgs));
}

/** Collapse the post-error callback values per the multiArgs option. */
function mapValues(values: any[], multiArgs: boolean | string[] | undefined): any {
  if (Array.isArray(multiArgs)) {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < multiArgs.length; i++) {
      out[multiArgs[i]] = values[i] as unknown;
    }
    return out;
  }

  if (multiArgs) {
    return values;
  }

  return values[0];
}

/** Bind `promisify` to one promise implementation. */
export function promisifyFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Turn an errfirst (or value-first) callback function into one returning a promise built against
   * the bound implementation.
   */
  function promisify(fn: TCallbackFn, options: IPromisifyOptions & ILazyOn): (...args: any[]) => TLazyOf<K, any>;
  function promisify(fn: TCallbackFn, options?: IPromisifyOptions): (...args: any[]) => TPromiseOf<K, any, never>;
  function promisify(
    fn: TCallbackFn,
    options?: IPromisifyOptions,
  ): (...args: any[]) => TPromiseOf<K, any, never> | TLazyOf<K, any> {
    const errorFirst = options?.errorFirst !== false;
    const multiArgs = options?.multiArgs;
    const useCustom = options?.custom !== false;
    const transformArgs = options?.transformArgs;
    const onCancelHook = options?.handleCancel;
    const AbortControllerCtor = options?.AbortController ?? deps.AbortController;
    // length stops at a default/rest param, so the source sniff covers `{ signal } = {}`
    const readsSignal = mayReadSignal(transformArgs, 2) || mayReadSignal(onCancelHook, 3);

    const customImpl = useCustom ? (fn as unknown as Record<PropertyKey, unknown>)[kCustom] : undefined;
    const custom: TCallbackFn | undefined = typeof customImpl === 'function' ? (customImpl as TCallbackFn) : undefined;

    const wrapped = function (this: unknown, ...callArgs: any[]): TPromiseOf<K, any, never> | TLazyOf<K, any> {
      // `run` is an arrow, so it keeps this function's receiver without aliasing it.
      const run = (resolve: (value: any) => void, reject: (reason?: any) => void, ctx?: IExecutorCtx) => {
        // Custom impl short-circuits the callback path entirely: call it and adopt its promise.
        if (custom) {
          deps.Impl.resolve(custom.apply(this, callArgs)).then(resolve, reject);
          return;
        }

        const handleCancel = ctx?.handleCancel;
        // plain state fed by the cancel handler below, so a hook that never asks costs one closure
        let controller: InstanceType<TAbortControllerCtor> | undefined;
        let canceled = false;
        let cancelReason: unknown;
        let getSignal = NO_SIGNAL;
        // no hook means nobody can ever ask for the signal
        if (handleCancel && (transformArgs || onCancelHook)) {
          const materialize = () => {
            if (!controller) {
              const Ctor = AbortControllerCtor || (AbortController as unknown as TAbortControllerCtor);
              controller = new Ctor();
              if (canceled) {
                controller.abort(cancelReason);
              }
            }
            return controller.signal;
          };
          getSignal = readsSignal ? withSignalAccessor(materialize) : (materialize as TGetSignal);
        }

        let args = callArgs;
        if (transformArgs) {
          args = transformArgs(callArgs.slice(), getSignal);
        }

        // Short-circuit guard: once cancel settles the promise, a late callback is a no-op.
        let settled = false;

        const callback = (...cbArgs: any[]) => {
          if (settled) {
            return;
          }
          settled = true;
          settleFromCallback(cbArgs, errorFirst, multiArgs, resolve, reject);
        };

        const handle: unknown = fn.apply(this, args.concat([callback]));

        if (handleCancel) {
          (handleCancel as unknown as (onCancel: (reason?: any) => void) => void)((reason?: any) => {
            settled = true;
            canceled = true;
            cancelReason = reason;
            if (controller) {
              controller.abort(reason);
            }
            if (onCancelHook) {
              onCancelHook(handle, args, getSignal, reason);
            }
          });
        }
      };

      // options bag forwarded to the promise constructor, so signal, bubble, and other promise opts pass through
      return constructTimed<any, K>(deps, run, options);
    };

    return setFnName(wrapped, 'promisify', fn, options?.displayName);
  }

  return promisify;
}

const DEFAULT_EXCLUDE = [/.+(?:Sync|Stream)$/];

export interface IPromisifyAllOptions extends IPromisifyOptions {
  /** Method names to include (string or RegExp match). When absent, all own function props qualify. */
  include?: (string | RegExp)[];
  /** Method names to exclude. Defaults to names ending in Sync or Stream. */
  exclude?: (string | RegExp)[];
  /** Skip the object itself when it is callable (a module that is also a function). */
  excludeMain?: boolean;
  /** clone: new object, promisified only. merge: write onto source, keep originals. overwrite: replace in place. */
  mode?: 'clone' | 'merge' | 'overwrite';
  /** General name transform for the promisified method (wins over suffix). */
  transformName?: (name: string) => string;
  /** Sugar for a name transform of `n => n + suffix`. */
  suffix?: string;
}

function nameMatches(name: string, patterns: (string | RegExp)[]): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === 'string' ? pattern === name : pattern.test(name)) {
      return true;
    }
  }
  return false;
}

/** Bind `promisifyAll` to one promise implementation. */
export function promisifyAllFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  const promisify = promisifyFactory(deps);

  // cache in factory closure avoids shared-dir split-brain across copies
  const wrappedCache = new WeakMap<TCallbackFn, (...args: any[]) => TPromiseOf<K, any, never>>();

  /**
   * Batch-promisify the methods of an object. See IPromisifyAllOptions for selection, naming, and
   * the clone/merge/overwrite modes.
   */
  return function promisifyAll<T extends object>(source: T, options?: IPromisifyAllOptions): any {
    const mode = options?.mode || 'clone';
    const include = options?.include;
    const exclude = options?.exclude || DEFAULT_EXCLUDE;

    const transformName = options?.transformName || (options?.suffix ? (n: string) => n + options.suffix : undefined);

    // merge/overwrite without a name change would clobber the original method.
    if ((mode === 'merge' || mode === 'overwrite') && !transformName) {
      throw new Error(
        'promisifyAll merge/overwrite requires transformName or suffix to avoid clobbering the original methods',
      );
    }

    const target = (mode === 'clone' ? {} : source) as Record<string, TCallbackFn>;

    for (const key of Object.keys(source)) {
      if (options?.excludeMain && key === 'main') {
        continue;
      }

      const value = (source as Record<string, unknown>)[key];
      if (typeof value !== 'function') {
        continue;
      }

      const method = value as TCallbackFn;

      if (include ? !nameMatches(key, include) : nameMatches(key, exclude)) {
        continue;
      }

      let wrapped = wrappedCache.get(method);
      if (!wrapped) {
        wrapped = promisify(method, options);
        wrappedCache.set(method, wrapped);
      }

      const outName = transformName ? transformName(key) : key;
      target[outName] = wrapped;
    }

    return target;
  };
}
