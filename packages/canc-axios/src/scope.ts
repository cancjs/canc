import { CancelError, isCancelError } from '@cancjs/promise';

import { AggregateError, isAbortError, isCancelable, isFunction, isObject } from '../../_util';

// stand-in so the source builds without DOM or Node lib types
export type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };

declare const AbortController: AbortControllerCtor;

// a polyfilled signal may lack addEventListener or onabort
interface PolyfilledAbortSignal {
  aborted?: boolean;
  reason?: any;
  onabort?: ((this: any, event: any) => any) | null;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
}

// Legacy onabort-only signals need one shared handler so requests can detach in any order.
type AbortListener = (event: any) => void;
interface AbortSubscription {
  callback: AbortListener;
  active: boolean;
}

interface AbortBinding {
  signal: PolyfilledAbortSignal;
  previous: PolyfilledAbortSignal['onabort'];
  handler: BoundAbortHandler;
  listeners: AbortSubscription[];
}
type BoundAbortHandler = AbortListener & { cancAbortBinding?: AbortBinding };

export const listenForAbort = (signal: PolyfilledAbortSignal, listener: AbortListener): (() => void) => {
  if (isFunction(signal.addEventListener)) {
    signal.addEventListener!('abort', listener);
    return () => {
      if (isFunction(signal.removeEventListener)) {
        signal.removeEventListener!('abort', listener);
      }
    };
  }

  if (!('onabort' in signal)) {
    return function () {};
  }

  let binding = (signal.onabort as BoundAbortHandler | null | undefined)?.cancAbortBinding;
  if (binding?.signal !== signal || binding.handler !== signal.onabort) {
    const previous = signal.onabort;
    const listeners: AbortSubscription[] = [];
    const handler: BoundAbortHandler = function (this: any, event: any) {
      for (const subscription of listeners.slice().reverse()) {
        if (subscription.active) {
          subscription.callback(event);
        }
      }

      if (isFunction(previous)) {
        previous.call(this, event);
      }
    };

    binding = { signal, previous, handler, listeners };
    handler.cancAbortBinding = binding;
    signal.onabort = handler;
  }

  const entry = binding;
  const subscription = { callback: listener, active: true };
  entry.listeners.push(subscription);

  return () => {
    if (!subscription.active) {
      return;
    }

    subscription.active = false;
    entry.listeners.splice(entry.listeners.indexOf(subscription), 1);
    if (!entry.listeners.length) {
      if (signal.onabort === entry.handler) {
        signal.onabort = entry.previous;
      }

      delete entry.handler.cancAbortBinding;
    }
  };
};

/** The config key carrying the per-request scope. Enumerable and string-keyed on purpose: axios
 * merges configs by walking Object.keys, so a symbol or a non-enumerable property would be dropped
 * before interceptors and the adapter ever see it. */
export const SCOPE_KEY = 'cancelScope';

const ABORT_ERROR_NAME = 'AbortError';

/** Recognizes an axios cancellation across versions and adapters: the `__CANCEL__` brand
 * (CanceledError, and Cancel on 0.x), the error code, the class name, and a bare AbortError thrown
 * by a custom adapter. */
const isAxiosCancel = (error: any): boolean =>
  isObject(error) &&
  ((error as any).__CANCEL__ === true ||
    (error as any).code === 'ERR_CANCELED' ||
    (error as any).name === 'CanceledError' ||
    isAbortError(error));

const toCancelError = (reason?: any): CancelError => {
  if (isCancelError(reason)) {
    return reason;
  }

  if (isObject(reason)) {
    return new CancelError(undefined, { cause: reason });
  }

  return new CancelError(reason);
};

/** Builds the CancelError for an abort that came from a caller-supplied signal, by the same rule as
 * cancel(): an object reason (an AbortError or TimeoutError) becomes the cause as is. A signal that
 * carries no reason gets an AbortError-shaped cause, so `CancelError#aborted` still reads true. */
const toAbortCancelError = (reason?: any): CancelError => {
  if (reason !== undefined) {
    return toCancelError(reason);
  }

  const cause = new Error('') as Error & { cause?: any };
  cause.name = ABORT_ERROR_NAME;

  return new CancelError('', { cause });
};

/**
 * Per-request cancellation state, shared with interceptors through the request config.
 *
 * Axios has no promise implementation hook: its interceptor chain is built on the native Promise,
 * so a pending user promise inside an interceptor cannot be reached from the outside. The scope is
 * the bridge. It owns the AbortSignal handed to axios, remembers the real cancel reason (axios
 * rewrites it: the fetch adapter re-mints an unrelated CanceledError from the message alone), and
 * cancels whatever promises interceptors registered.
 */
export class CancelScope {
  /** The Canc-owned signal used to compose the initial transport signal. */
  signal: any;
  aborted: boolean;
  /** The cancellation the caller should see, recorded before axios can replace it. */
  reason: CancelError | undefined;

  private _controller: { abort: (reason?: any) => void; signal: any };
  private _linked: { cancel: (reason?: any) => void }[];
  private _detach: () => void;
  private _reject: ((error: CancelError) => void) | undefined;
  private _stream: any;

  constructor(ControllerCtor?: AbortControllerCtor) {
    const Ctor = ControllerCtor || (typeof AbortController !== 'undefined' ? AbortController : (undefined as any));

    this._controller = new Ctor();
    this._linked = [];
    this._detach = function () {};
    this._reject = undefined;
    this._stream = undefined;
    this.signal = this._controller.signal;
    this.aborted = false;
    this.reason = undefined;
  }

  /** True once the request has been canceled, for interceptors that want to bail out early. */
  isCanceled(): boolean {
    return this.aborted;
  }

  /** Cancels the request: aborts the signal axios is listening on and cancels linked promises. */
  cancel(reason?: any): void {
    this.abort(toCancelError(reason));
  }

  /** Ties a cancelable promise created inside an interceptor to this request, so canceling the
   * request cancels it too. Already-canceled requests cancel it immediately. */
  link<T>(promise: T): T {
    if (isCancelable(promise)) {
      if (this.aborted) {
        (promise as any).cancel(this.reason);
      } else {
        this._linked.push(promise as any);
      }
    }

    return promise;
  }

  abort(error: CancelError): void {
    if (this.aborted) {
      return;
    }

    this.aborted = true;
    this.reason = error;
    this._controller.abort(error);

    const reject = this._reject;
    this._reject = undefined;

    if (reject) {
      reject(error);
    }

    this._destroyStream();
    this.finalize();

    const linked = this._linked;
    this._linked = [];
    const failures: any[] = [];

    for (const promise of linked) {
      try {
        promise.cancel(error);
      } catch (failure) {
        failures.push(failure);
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }

    if (failures.length > 1) {
      throw new AggregateError(failures, 'Linked promises failed to cancel');
    }
  }

  /** Registers how to reject the outer promise when the scope aborts, so an adapter that ignores
   * the signal cannot keep the caller waiting. */
  rejectOnAbort(reject: (error: CancelError) => void): void {
    this._reject = reject;
  }

  /** Keeps the scope armed for a streamed response body: an abort destroys the stream, and the
   * caller signal is released once the stream closes. */
  holdStream(stream: any): void {
    this._stream = stream;

    if (this.aborted) {
      this._destroyStream();
      return;
    }

    // Native Axios can emit a cancellation error synchronously, before the scope's signal listener.
    // Normalize at the public stream event boundary without changing ordinary stream errors.
    const emit = stream.emit;
    const ownEmit = Object.getOwnPropertyDescriptor(stream, 'emit');
    const normalize = (error: any) => this.toRejection(error);
    const normalizedEmit = function (this: any, event: any, ...args: any[]): any {
      if (event === 'error' && isAxiosCancel(args[0])) {
        if (isFunction(this.listenerCount) && this.listenerCount('error') === 0) {
          return false;
        }

        args[0] = normalize(args[0]);
      }

      return emit.apply(this, [event, ...args]);
    };

    if (isFunction(emit)) {
      stream.emit = normalizedEmit;
    }

    const release = () => {
      this._stream = undefined;
      this.finalize();
      if (stream.emit === normalizedEmit) {
        if (ownEmit) {
          Object.defineProperty(stream, 'emit', ownEmit);
        } else {
          delete stream.emit;
        }
      }

      if (isFunction(stream.removeListener)) {
        stream.removeListener('close', release);
        stream.removeListener('end', release);
      }
    };

    stream.on('close', release);
    stream.on('end', release);
  }

  private _destroyStream(): void {
    const stream = this._stream;
    this._stream = undefined;

    if (stream && !stream.destroyed) {
      // an unheard error event crashes, only a watched stream gets one
      const watched = isFunction(stream.listenerCount) && stream.listenerCount('error') > 0;
      stream.destroy(watched ? this.reason : undefined);
    }
  }

  /** Forwards aborts from a caller-supplied signal onto this scope. Mirrors the wiring in
   * @cancjs/fetch: prefer addEventListener, fall back to chaining onabort for legacy polyfills,
   * and always leave the caller's signal as it was found. */
  watch(original: PolyfilledAbortSignal | null | undefined): void {
    if (!original) {
      return;
    }

    if (original.aborted) {
      this.abort(toAbortCancelError(original.reason));
      return;
    }

    this._chainDetach(listenForAbort(original, () => this.abort(toAbortCancelError(original.reason))));
  }

  private _chainDetach(detach: () => void): void {
    const earlier = this._detach;

    this._detach = function () {
      earlier();
      detach();
    };
  }

  /** Detaches everything wired onto a caller signal, so a long-lived signal reused across many
   * requests does not accumulate listeners. */
  finalize(): void {
    const detach = this._detach;
    this._detach = function () {};
    detach();
  }

  /** Normalizes an axios rejection. A cancellation always surfaces as the recorded CancelError,
   * never as whatever axios happened to throw; anything else passes through untouched.
   *
   * Cancellation is a stop signal on its own channel and rejects with a CancelError, so it does not
   * contribute to the declared failure set (AxiosError). */
  toRejection(reason: any): any {
    if (this.aborted) {
      return this.reason;
    }

    if (isAxiosCancel(reason)) {
      const finalSignal = isObject(reason) ? (reason as any).config?.signal : undefined;

      // Without final config, a provisional signal cannot identify the abort source
      if (finalSignal?.aborted) {
        return toAbortCancelError(finalSignal.reason);
      }

      return new CancelError(isObject(reason) ? (reason as any).message : undefined, { cause: reason });
    }

    return reason;
  }
}

/** Reads the scope off anything an interceptor receives: a config, a response, or an error. */
export const getScope = (source: any): CancelScope | undefined => {
  if (!isObject(source)) {
    return undefined;
  }

  const direct = (source as any)[SCOPE_KEY];

  if (direct instanceof CancelScope) {
    return direct;
  }

  const config = (source as any).config || (source as any).response?.config;

  if (isObject(config) && (config as any)[SCOPE_KEY] instanceof CancelScope) {
    return (config as any)[SCOPE_KEY];
  }

  return undefined;
};
