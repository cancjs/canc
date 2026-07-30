import type { CancelablePromise } from '@cancjs/promise';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosStatic } from 'axios';

import type { AbortControllerCtor } from './scope';

/**
 * What the wrapper needs from an axios instance. Deliberately structural: the supported range spans
 * axios 0.22 up, and a consumer's axios types will not match the ones this package was built
 * against. Everything beyond these three members is feature-detected at runtime.
 */
export interface AxiosInstanceLike {
  request(config: any): Promise<any>;
  defaults: any;
  interceptors: {
    request: any;
    response: any;
  };
}

export interface ICancelableAxiosOptions {
  /** AbortController implementation used to abort the underlying request. Defaults to the ambient
   * global, read when a request starts. Environments with a missing or faulty polyfill pass a
   * working one here. */
  AbortController?: AbortControllerCtor;
}

/**
 * The cancellation handle an interceptor receives as its second argument. Axios calls interceptors
 * with a single argument, so the extra one is inert for axios itself.
 */
export interface ICancelContext {
  /** The signal the underlying request is listening on. */
  signal: any;
  isCanceled(): boolean;
  /** Cancels the request this interceptor is running for. */
  cancel(reason?: any): void;
  /** Ties a cancelable promise to the request, so canceling the request cancels it too. Promises
   * returned from an interceptor are linked automatically; this is for the rest. */
  link<T>(promise: T): T;
}

export interface IInterceptorOptions {
  synchronous?: boolean;
  runWhen?: ((config: any) => boolean) | null;
}

export interface ICancelableInterceptorManager<V> {
  use(
    onFulfilled?: ((value: V, ctx: ICancelContext) => V | Promise<V>) | null,
    onRejected?: ((error: any, ctx: ICancelContext) => any) | null,
    options?: IInterceptorOptions,
  ): number;
  eject(id: number): void;
  /** Typed as always present to keep the instance assignable to AxiosInstance. It is mirrored only
   * when the underlying axios has it, which excludes 0.22. */
  clear(): void;
  readonly handlers: any[];
}

export interface ICancelableAxiosInterceptors {
  request: ICancelableInterceptorManager<any>;
  response: ICancelableInterceptorManager<AxiosResponse>;
}

/**
 * An axios instance whose request methods return a CancelablePromise. The generics mirror axios, so
 * existing call sites keep their types, and CancelablePromise extends Promise, so the instance stays
 * assignable wherever an AxiosInstance is expected.
 */
export interface CancelableAxiosInstance {
  <T = any, R = AxiosResponse<T>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R>;
  <T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): CancelablePromise<R>;

  request<T = any, R = AxiosResponse<T>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R>;
  get<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): CancelablePromise<R>;
  delete<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): CancelablePromise<R>;
  head<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): CancelablePromise<R>;
  options<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): CancelablePromise<R>;
  post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;
  put<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;
  patch<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;

  /** Mirrored only when the underlying axios exposes them. */
  postForm<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;
  putForm<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;
  patchForm<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;
  query<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): CancelablePromise<R>;

  create(config?: AxiosRequestConfig): CancelableAxiosInstance;
  getUri(config?: AxiosRequestConfig): string;

  defaults: AxiosInstance['defaults'];
  interceptors: ICancelableAxiosInterceptors;

  /** The wrapped axios instance. Reach for it when a raw native promise is wanted. */
  readonly axios: AxiosInstanceLike;
}

/**
 * The drop-in default export: an instance plus the statics axios hangs off its own default export.
 * Members added to axios after 0.22 are mirrored when the installed version has them, which is why
 * they are optional here.
 */
export interface CancelableAxiosStatic extends CancelableAxiosInstance {
  /** Wraps an existing axios instance, for code that builds its own. */
  wrap(instance: AxiosInstanceLike, options?: ICancelableAxiosOptions): CancelableAxiosInstance;

  Axios: AxiosStatic['Axios'];
  CancelToken: AxiosStatic['CancelToken'];
  Cancel: AxiosStatic['Cancel'];
  isCancel: AxiosStatic['isCancel'];
  isAxiosError: AxiosStatic['isAxiosError'];
  spread: AxiosStatic['spread'];
  readonly VERSION: string;

  /** Unlike axios.all this composes with CancelablePromise.all, so canceling the aggregate cancels
   * every request in it. */
  all<T>(values: (T | PromiseLike<T>)[]): CancelablePromise<T[]>;

  AxiosError?: any;
  CanceledError?: any;
  AxiosHeaders?: any;
  HttpStatusCode?: any;
  mergeConfig?: any;
  toFormData?: any;
  formToJSON?: any;
  getAdapter?: any;
}
