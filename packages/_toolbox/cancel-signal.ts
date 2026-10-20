import { THandleCancel } from './construct';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
type AbortControllerCtor = new () => { abort(reason?: any): void; signal: unknown };

/**
 * Lazily materialized outbound cancel-signal. Calling `getSignal()` returns the AbortSignal (or
 * `undefined` when `Impl` is not cancelable-shaped). Reading its `signal` property does the same: it
 * is a non-enumerable getter, so destructuring `{ signal }` off the function works too.
 */
export interface TGetSignal {
  (): any;
  /** The signal `getSignal()` returns, created on first read exactly as on the first call. */
  readonly signal: any;
}

/** The outbound cancel-signal of one promise node, as returned by `makeCancelSignal`. */
export interface ICancelSignalHolder {
  /**
   * Get the outbound signal, creating the controller on first call.
   * @deprecated Use `signal`.
   */
  getSignal: TGetSignal;
  /**
   * The signal `getSignal()` returns. An inherited non-enumerable getter, so spread and
   * `JSON.stringify` neither copy it nor create the controller.
   */
  readonly signal: any;
}

// one shared getter for every getSignal function: a per-call closure getter costs a dictionary map
const FN_SIGNAL_DESCRIPTOR: PropertyDescriptor = {
  configurable: true,
  get: function (this: () => any): any {
    return this();
  },
};

function withSignalAccessor(getSignal: () => any): TGetSignal {
  Object.defineProperty(getSignal, 'signal', FN_SIGNAL_DESCRIPTOR);
  return getSignal as TGetSignal;
}

// a plain constructor so every holder shares one map and inherits the signal getter
const CancelSignalHolder = function CancelSignalHolder(this: ICancelSignalHolder, getSignal: TGetSignal) {
  this.getSignal = getSignal;
} as unknown as new (getSignal: TGetSignal) => ICancelSignalHolder;

Object.defineProperty(CancelSignalHolder.prototype, 'signal', {
  configurable: true,
  get: function (this: ICancelSignalHolder): any {
    return this.getSignal();
  },
});

/** The `getSignal` handed out where `Impl` is not cancelable-shaped: always `undefined`. */
export const NO_SIGNAL: TGetSignal = Object.freeze(withSignalAccessor(() => undefined));

const NO_SIGNAL_HOLDER: ICancelSignalHolder = Object.freeze(new CancelSignalHolder(NO_SIGNAL));

/** A signal source not yet wired to a promise node: feed `onCancel` from a cancel handler. */
export interface ICancelSignalSource {
  getSignal: TGetSignal;
  onCancel: (reason?: any) => void;
}

/**
 * Build the state behind an outbound cancel-signal without registering anything, so a caller that
 * already owns a cancel handler can feed `onCancel` from it instead of wiring a second one.
 * `getSignal` constructs the controller only on its first call, already aborted when `onCancel`
 * ran before.
 */
export function createCancelSignalSource(
  AbortControllerCtor?: AbortControllerCtor,
  normalizeReason?: (reason?: any) => any,
): ICancelSignalSource {
  let controller: InstanceType<AbortControllerCtor> | undefined;
  let canceled = false;
  let cancelReason: unknown;

  const abort = (ac: InstanceType<AbortControllerCtor>) => {
    ac.abort(normalizeReason ? normalizeReason(cancelReason) : cancelReason);
  };

  return {
    getSignal: withSignalAccessor(() => {
      if (!controller) {
        const Ctor: AbortControllerCtor = AbortControllerCtor || (AbortController as unknown as AbortControllerCtor);
        controller = new Ctor();
        if (canceled) {
          abort(controller);
        }
      }

      return controller.signal;
    }),
    onCancel: (reason?: any) => {
      canceled = true;
      cancelReason = reason;
      if (controller) {
        abort(controller);
      }
    },
  };
}

/**
 * Build a lazy outbound cancel-signal off a promise node's `handleCancel`. The returned `getSignal`
 * thunk constructs the controller only on its first call (via the injected `AbortController` ctor,
 * or the ambient global read at that moment, never at module load). A cancel handler is wired up
 * front, so a first call after the node was canceled returns an already aborted signal. A callback
 * that never calls `getSignal()` constructs no controller.
 *
 * `normalizeReason` lets a cancelable consumer brand the abort reason (e.g. wrap it in a
 * CancelError) while the plain/native path passes the reason through raw (the default).
 */
export function makeCancelSignal(
  handleCancel: THandleCancel | undefined,
  AbortControllerCtor?: AbortControllerCtor,
  normalizeReason?: (reason?: any) => any,
): ICancelSignalHolder {
  if (typeof handleCancel !== 'function') {
    return NO_SIGNAL_HOLDER;
  }

  const source = createCancelSignalSource(AbortControllerCtor, normalizeReason);
  handleCancel(source.onCancel);

  return new CancelSignalHolder(source.getSignal);
}
