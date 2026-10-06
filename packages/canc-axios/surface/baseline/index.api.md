# Public surface: @cancjs/axios .

Generated. Do not edit by hand.

- Declarations: `packages/canc-axios/dist/types/index.d.ts`
- Exports: 13

## `CancelScope` (class)

```text
new (ControllerCtor?: AbortControllerCtor | undefined): CancelScope
_controller: any
_detach: any
_linked: any
abort: (error: CancelError) => void
aborted: boolean
cancel: (reason?: any) => void
finalize: () => void
isCanceled: () => boolean
link: <T>(promise: T) => T
reason: CancelError | undefined
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
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D>>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
interceptors: ICancelableAxiosInterceptors
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
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
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D>>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D>>
Axios: typeof Axios
AxiosError?: any
AxiosHeaders?: any
Cancel: CancelStatic
CancelToken: CancelTokenStatic
CanceledError?: any
HttpStatusCode?: any
readonly VERSION: string
all: <T>(values: (T | PromiseLike<T>)[]) => CancelablePromise<T[], FailureOf<T>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
formToJSON?: any
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
getAdapter?: any
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
interceptors: ICancelableAxiosInterceptors
isAxiosError: <T = any, D = any>(payload: any) => payload is AxiosError<T, D>
isCancel: <T = any>(value: any) => value is CanceledError<T>
mergeConfig?: any
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
spread: <T, R>(callback: (...args: T[]) => R) => (array: T[]) => R
toFormData?: any
wrap: (instance: IAxiosInstanceLike, options?: ICancelableAxiosOptions) => ICancelableAxiosInstance
```

## `ICancelableAxiosWrapOptions` (type)

```text
AbortController?: AbortControllerCtor | undefined
```

## `ICancelableInterceptorManager<V>` (interface)

```text
clear: () => void
eject: (id: number) => void
readonly handlers: Array<any>
use: (onFulfilled?: ((value: V, ctx: ICancelableAxiosContext) => V | Promise<V>) | null, onRejected?: ((error: any, ctx: ICancelableAxiosContext) => any) | null, options?: IInterceptorOptions) => number
```

## `IInterceptorOptions` (interface)

```text
runWhen?: ((config: any) => boolean) | null | undefined
synchronous?: boolean | undefined
```

## `cancelableAxios` (const)

```text
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D>>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D>>
Axios: typeof Axios
AxiosError?: any
AxiosHeaders?: any
Cancel: CancelStatic
CancelToken: CancelTokenStatic
CanceledError?: any
HttpStatusCode?: any
readonly VERSION: string
all: <T>(values: (T | PromiseLike<T>)[]) => CancelablePromise<T[], FailureOf<T>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
formToJSON?: any
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
getAdapter?: any
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
interceptors: ICancelableAxiosInterceptors
isAxiosError: <T = any, D = any>(payload: any) => payload is AxiosError<T, D>
isCancel: <T = any>(value: any) => value is CanceledError<T>
mergeConfig?: any
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
spread: <T, R>(callback: (...args: T[]) => R) => (array: T[]) => R
toFormData?: any
wrap: (instance: IAxiosInstanceLike, options?: ICancelableAxiosOptions) => ICancelableAxiosInstance
```

## `default` (const)

```text
<T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>): CancelablePromise<R, AxiosError<T, D>>
<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D> | undefined): CancelablePromise<R, AxiosError<T, D>>
Axios: typeof Axios
AxiosError?: any
AxiosHeaders?: any
Cancel: CancelStatic
CancelToken: CancelTokenStatic
CanceledError?: any
HttpStatusCode?: any
readonly VERSION: string
all: <T>(values: (T | PromiseLike<T>)[]) => CancelablePromise<T[], FailureOf<T>>
readonly axios: IAxiosInstanceLike
create: (config?: AxiosRequestConfig) => ICancelableAxiosInstance
defaults: Omit<AxiosDefaults<any>, "headers"> & { headers: HeadersDefaults & { [key: string]: AxiosHeaderValue; }; }
delete: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
formToJSON?: any
get: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
getAdapter?: any
getUri: (config?: AxiosRequestConfig) => string
head: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
interceptors: ICancelableAxiosInterceptors
isAxiosError: <T = any, D = any>(payload: any) => payload is AxiosError<T, D>
isCancel: <T = any>(value: any) => value is CanceledError<T>
mergeConfig?: any
options: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patch: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
patchForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
post: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
postForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
put: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
putForm: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
query: <T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
request: <T = any, R = AxiosResponse<T, any, {}>, D = any>(config: AxiosRequestConfig<D>) => CancelablePromise<R, AxiosError<T, D>>
spread: <T, R>(callback: (...args: T[]) => R) => (array: T[]) => R
toFormData?: any
wrap: (instance: IAxiosInstanceLike, options?: ICancelableAxiosOptions) => ICancelableAxiosInstance
```

## `wrapAxios` (function)

```text
(instance: IAxiosInstanceLike, options?: ICancelableAxiosWrapOptions | undefined): ICancelableAxiosInstance
```
