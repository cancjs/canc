import { CancelablePromise, CancelError, createAbortSignal } from '@cancjs/promise';

type TFetch = typeof globalThis.fetch;
type TFetchParams = Parameters<TFetch>;
type TFetchResult = Awaited<ReturnType<TFetch>>;
type TCancelableFetch = (...args: TFetchParams) => CancelablePromise<TFetchResult>;

const createCancelableFetch = <T extends Function = TFetch>(fetch: T)=> {
 function cancelableFetch(...args: TFetchParams): CancelablePromise<TFetchResult> {
 // TODO: CancelablePromise abort interop
 const promise = new CancelablePromise<TFetchResult>((resolve, reject, handleCancel) => {
 const { abort, signal } = createAbortSignal();

 handleCancel(() => abort());

 fetch(...args, { signal }).then(resolve, (err: any) => {
 if (err?.name === 'AbortError') {
 reject(new CancelError('', { cause: err }));
 } else {
 reject(err);
 }
 });
 });

 return promise;
 }

 return cancelableFetch;
};

export default createCancelableFetch;