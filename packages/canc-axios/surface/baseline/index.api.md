# Public surface: @cancjs/axios .

Generated. Do not edit by hand.

- Declarations: `packages/canc-axios/dist/types/index.d.ts`
- Exports: 13

## `CancelScope` (class)

```text
new (ControllerCtor?: AbortControllerCtor | undefined): CancelScope
_chainDetach: any
_controller: any
_destroyStream: any
_detach: any
_linked: any
_reject: any
_stream: any
abort: (error: CancelError) => void
aborted: boolean
cancel: (reason?: any) => void
finalize: () => void
holdStream: (stream: any) => void
isCanceled: () => boolean
link: <T>(promise: T) => T
reason: CancelError | undefined
rejectOnAbort: (reject: (error: CancelError) => void) => void
signal: any
toRejection: (reason: any) => any
watch: (original: PolyfilledAbortSignal | null | undefined) => void
```

## `IAxiosInstanceLike` (interface)

```text
defaults: any
interceptors: { request: any; response: any; }
request: (config: any) => Promise<any>
```

## `ICancelableAxiosContext` (interface)

```text
cancel: (reason?: any) => void
isCanceled: () => boolean
link: <T>(promise: T) => T
signal: any
```

## `ICancelableAxiosInstance` (interface)

```text
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D> | Unlisted>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D> | Unlisted>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
interceptors: ICancelableAxiosInterceptors
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
```

## `ICancelableAxiosInterceptors` (interface)

```text
request: ICancelableInterceptorManager<any>
response: ICancelableInterceptorManager<AxiosResponse<any, any, {}>>
```

## `ICancelableAxiosOptions` (interface)

```text
AbortController?: AbortControllerCtor | undefined
```

## `ICancelableAxiosStatic` (interface)

```text
extends ICancelableAxiosInstance
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D> | Unlisted>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D> | Unlisted>
Axios: typeof Axios
AxiosError?: any
AxiosHeaders?: any
Cancel: CancelStatic
CancelToken: CancelTokenStatic
CanceledError?: any
HttpStatusCode?: any
readonly VERSION: string
all: <T>(values: (PromiseLike<T> | T)[]) => CancelablePromise<T[], FailureOf<T>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
formToJSON?: any
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
getAdapter?: any
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
interceptors: ICancelableAxiosInterceptors
isAxiosError: <T = any, D = any>(payload: any) => payload is AxiosError<T, D>
isCancel: <T = any>(value: any) => value is CanceledError<T>
mergeConfig?: any
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
spread: <T, R>(callback: (...args: T[]) => R) => (array: T[]) => R
toFormData?: any
wrap: (instance: IAxiosInstanceLike, options?: ICancelableAxiosOptions) => ICancelableAxiosInstance
```

## `ICancelableAxiosWrapOptions` (type)

```text
AbortController?: AbortControllerCtor | undefined
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
signal?: Array<IAbortSignal> | IAbortSignal | undefined
strict?: boolean | undefined
```

## `ICancelableInterceptorManager<V>` (interface)

```text
clear: () => void
eject: (id: number) => void
readonly handlers: Array<any>
use: (onFulfilled?: ((value: V, ctx: ICancelableAxiosContext) => Promise<V> | V) | null, onRejected?: ((error: any, ctx: ICancelableAxiosContext) => any) | null, options?: IInterceptorOptions) => number
```

## `IInterceptorOptions` (interface)

```text
runWhen?: ((config: any) => boolean) | null | undefined
synchronous?: boolean | undefined
```

## `cancelableAxios` (const)

```text
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D> | Unlisted>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D> | Unlisted>
Axios: typeof Axios
AxiosError?: any
AxiosHeaders?: any
Cancel: CancelStatic
CancelToken: CancelTokenStatic
CanceledError?: any
HttpStatusCode?: any
readonly VERSION: string
all: <T>(values: (PromiseLike<T> | T)[]) => CancelablePromise<T[], FailureOf<T>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
formToJSON?: any
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
getAdapter?: any
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
interceptors: ICancelableAxiosInterceptors
isAxiosError: <T = any, D = any>(payload: any) => payload is AxiosError<T, D>
isCancel: <T = any>(value: any) => value is CanceledError<T>
mergeConfig?: any
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
spread: <T, R>(callback: (...args: T[]) => R) => (array: T[]) => R
toFormData?: any
wrap: (instance: IAxiosInstanceLike, options?: ICancelableAxiosOptions) => ICancelableAxiosInstance
```

## `default` (const)

```text
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D> | Unlisted>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D> | Unlisted>
Axios: typeof Axios
AxiosError?: any
AxiosHeaders?: any
Cancel: CancelStatic
CancelToken: CancelTokenStatic
CanceledError?: any
HttpStatusCode?: any
readonly VERSION: string
all: <T>(values: (PromiseLike<T> | T)[]) => CancelablePromise<T[], FailureOf<T>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
formToJSON?: any
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
getAdapter?: any
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
interceptors: ICancelableAxiosInterceptors
isAxiosError: <T = any, D = any>(payload: any) => payload is AxiosError<T, D>
isCancel: <T = any>(value: any) => value is CanceledError<T>
mergeConfig?: any
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D> | Unlisted>
spread: <T, R>(callback: (...args: T[]) => R) => (array: T[]) => R
toFormData?: any
wrap: (instance: IAxiosInstanceLike, options?: ICancelableAxiosOptions) => ICancelableAxiosInstance
```

## `wrapAxios` (function)

```text
(instance: IAxiosInstanceLike, options?: ICancelableAxiosWrapOptions | undefined): ICancelableAxiosInstance
```
