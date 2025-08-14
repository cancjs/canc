import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CancelablePromise, isCancelError, isAbortError } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

/**
 * Wraps an axios instance so its request methods return CancelablePromise.
 * Calling .cancel() on the returned promise aborts the underlying request via AbortSignal.
 * Response interceptors remain part of the cancelable chain.
 */
export function cancAxios(instance: AxiosInstance) {
 return {
 get<T = unknown>(url: string, config?: AxiosRequestConfig): CancelablePromise<T> {
 return this.request({ ...config, method: 'GET', url });
 },

 post<T = unknown>(
 url: string,
 data?: unknown,
 config?: AxiosRequestConfig,
 ): CancelablePromise<T> {
 return this.request({ ...config, method: 'POST', url, data });
 },

 request<T = unknown>(config: AxiosRequestConfig): CancelablePromise<T> {
 // Wrap the signal-aware axios call with cancelify so the returned promise is cancelable.
 return cancelify<[AxiosRequestConfig], T>(
 (getSignal: () => AbortSignal, [cfg]: [AxiosRequestConfig]) => {
 return instance
 .request({
 ...cfg,
 signal: getSignal(),
 })
 .then((res) => res.data as T)
 .catch((err: unknown) => {
 // Map axios AbortError / abort rejection to CancelError for consistency.
 if (
 err instanceof Error &&
 (err.name === 'AbortError' || isAbortError(err))
 ) {
 throw err; // Let cancelify map it to CancelError.
 }
 // Re-throw other errors (network, validation, etc).
 throw err;
 });
 },
 )(config);
 },
 };
}
