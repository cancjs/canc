import { CancelError, isCancelError } from '@cancjs/promise';

import { isCancelable, isFunction, isObject } from '../../_util';

// Structural stand-in so the source builds in environments without DOM/Node lib types.
export type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };

declare const AbortController: AbortControllerCtor;

// A caller signal may be polyfilled and lack addEventListener/onabort, so feature-detect members.
interface PolyfilledAbortSignal {
  aborted?: boolean;
  reason?: any;
  onabort?: ((this: any, event: any) => any) | null;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
}

/** The config key carrying the per-request scope. Enumerable and string-keyed on purpose: axios
 * merges configs by walking Object.keys, so a symbol or a non-enumerable property would be dropped
 * before interceptors and the adapter ever see it. */
export const SCOPE_KEY = 'cancelScope';

const ABORT_ERROR_NAME = 'AbortError';

const isAbortError = (error: any): boolean => isObject(error) && (error as any).name === ABORT_ERROR_NAME;

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

/** Builds the CancelError for an abort that came from a caller-supplied signal. The cause is kept
 * AbortError-shaped so `CancelError#aborted` reads true. */
const toAbortCancelError = (reason?: any): CancelError => {
  if (isCancelError(reason)) {
    return reason;
  }

  if (isAbortError(reason)) {
    return new CancelError(reason.message, { cause: reason });
  }

  const message =
    isObject(reason) ? String((reason as any).message || '')
    : reason == null ? ''
    : String(reason);
  const cause = new Error(message) as Error & { cause?: any };
  cause.name = ABORT_ERROR_NAME;

  if (reason !== undefined) {
    cause.cause = reason;
  }

  return new CancelError(message, { cause });
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
  /** The signal passed to axios as `config.signal`. */
  signal: any;
  aborted: boolean;
  /** The cancellation the caller should see, recorded before axios can replace it. */
  reason: CancelError | undefined;

  private _controller: { abort: (reason?: any) => void; signal: any };
  private _linked: { cancel: (reason?: any) => void }[];
  private _detach: () => void;

  constructor(ControllerCtor?: AbortControllerCtor) {
    const Ctor = ControllerCtor || (typeof AbortController !== 'undefined' ? AbortController : (undefined as any));

    this._controller = new Ctor();
    this._linked = [];
    this._detach = function () {};
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

    const linked = this._linked;
    this._linked = [];

    for (const promise of linked) {
      promise.cancel(error);
    }
  }

  /** Forwards aborts from a caller-supplied signal onto this scope. Mirrors the wiring in
   * @cancjs/fetch: prefer addEventListener, fall back to chaining onabort for legacy polyfills,
   * and always leave the caller's signal as it was found. */
  watch(original: PolyfilledAbortSignal | null | undefined): void {
    if (!original) {
      return;
    }

    const self = this;

    if (original.aborted) {
      this.abort(toAbortCancelError(original.reason));
      return;
    }

    if (isFunction(original.addEventListener)) {
      const listener = function () {
        self.abort(toAbortCancelError(original.reason));
      };

      original.addEventListener!('abort', listener);

      if (isFunction(original.removeEventListener)) {
        this._detach = function () {
          original.removeEventListener!('abort', listener);
        };
      }

      return;
    }

    if ('onabort' in original) {
      const previous = original.onabort;

      original.onabort = function (this: any, event: any) {
        self.abort(toAbortCancelError(original.reason));

        if (isFunction(previous)) {
          previous.call(this, event);
        }
      };

      this._detach = function () {
        original.onabort = previous || null;
      };
    }
  }

  /** Detaches everything wired onto a caller signal, so a long-lived signal reused across many
   * requests does not accumulate listeners. */
  finalize(): void {
    const detach = this._detach;
    this._detach = function () {};
    detach();
  }

  /** Normalizes an axios rejection. A cancellation always surfaces as the recorded CancelError,
   * never as whatever axios happened to throw; anything else passes through untouched. */
  toRejection(reason: any): any {
    if (this.aborted) {
      return this.reason;
    }

    if (isAxiosCancel(reason)) {
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
