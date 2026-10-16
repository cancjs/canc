/**
 * Engine-specific detection and code paths for the core promise class.
 *
 * Every check runs once, when the core module loads, against the Promise implementation the core
 * captured. A modern engine passes every check and keeps the plain paths in the core class. Only an
 * implementation that fails a check takes the matching path in this module.
 *
 * Then children built with a shared no-op executor. A spec `then` constructs the child through the
 * species constructor with a fresh executor per call and settles the child only through the resolve
 * and reject that executor received, which are the core's cancelable wrappers. zone.js (loaded ahead
 * of the app by Angular), es6-promise, promise-polyfill and lie pass one shared no-op executor
 * instead and settle the child through their own internals. The child's cancelable state never
 * moves there: a cancel does not reach it, and it stays cancelable after it settles. When this is
 * detected, `then` builds its own child and settles it from reactions on the parent. Native engines,
 * core-js and then/promise (Hermes) hand out a fresh executor per call and keep the native `then`.
 */

type TSettle = (value: unknown) => void;
type THandler = ((value: any) => unknown) | null | undefined;

interface IOwnChildConstructor {
  new (executor: (resolve: TSettle, reject: TSettle) => void): object;
  _pendingInternalCall: boolean;
}

interface IOwnChildParent {
  constructor: IOwnChildConstructor;
  _subscribe(onFulfilled: TSettle, onRejected: TSettle): void;
}

function noop(): void {}

/**
 * Reports whether `then` of the given Promise implementation builds every child with one shared
 * executor instead of a fresh one per call. An implementation that cannot be probed counts as spec
 * compliant.
 */
export function thenSkipsChildExecutor(PromiseImpl: PromiseConstructor): boolean {
  const executors: unknown[] = [];
  function Spy(executor: unknown): void {
    executors.push(executor);
  }
  try {
    if (typeof Symbol === 'function' && typeof Symbol.species === 'symbol') {
      Object.defineProperty(Spy, Symbol.species, { value: Spy });
    }
    const probe = Object.defineProperty(new PromiseImpl<void>(noop), 'constructor', { value: Spy });
    for (let call = 0; call < 2; call++) {
      try {
        void PromiseImpl.prototype.then.call(probe, noop, noop);
      } catch (_e) {
        // a spec then refuses the capability, Spy never ran the executor it got
      }
    }
  } catch (_e) {
    return false;
  }
  return executors.length === 2 && executors[0] === executors[1];
}

/**
 * Builds a `then` child of the parent's own class and settles it through the child's resolve and
 * reject, driven by plain reactions on the parent.
 */
export function thenWithOwnChild<TChild>(parent: object, onFulfilled: THandler, onRejected: THandler): TChild {
  const host = parent as IOwnChildParent;
  const Child = host.constructor;
  let resolveChild!: TSettle;
  let rejectChild!: TSettle;
  let child: object;
  try {
    Child._pendingInternalCall = true;
    child = new Child((resolve, reject) => {
      resolveChild = resolve;
      rejectChild = reject;
    });
  } finally {
    Child._pendingInternalCall = false;
  }

  const settleWith = (handler: THandler, passThrough: TSettle) => (value: unknown) => {
    if (typeof handler !== 'function') {
      passThrough(value);
      return;
    }
    let result: unknown;
    try {
      result = handler(value);
    } catch (error) {
      rejectChild(error);
      return;
    }
    resolveChild(result);
  };
  host._subscribe(settleWith(onFulfilled, resolveChild), settleWith(onRejected, rejectChild));

  return child as TChild;
}
