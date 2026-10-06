# Public surface: @cancjs/server-fastify .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-fastify/dist/types/index.d.ts`
- Exports: 15

## `CLIENT_DISCONNECTED` (const)

```text
[iterator]: () => StringIterator<string>
anchor: (name: string) => string
at: (index: number) => string | undefined
big: () => string
blink: () => string
bold: () => string
charAt: (pos: number) => string
charCodeAt: (index: number) => number
codePointAt: (pos: number) => number | undefined
concat: (...strings: string[]) => string
endsWith: (searchString: string, endPosition?: number) => boolean
fixed: () => string
fontcolor: (color: string) => string
fontsize: { (size: number): string; (size: string): string; }
includes: (searchString: string, position?: number) => boolean
indexOf: (searchString: string, position?: number) => number
italics: () => string
lastIndexOf: (searchString: string, position?: number) => number
readonly length: number
link: (url: string) => string
localeCompare: { (that: string): number; (that: string, locales?: string | string[], options?: Intl.CollatorOptions): number; (that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number; }
match: { (regexp: string | RegExp): RegExpMatchArray | null; (matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null; }
matchAll: (regexp: RegExp) => RegExpStringIterator<RegExpExecArray>
normalize: { (form: "NFC" | "NFD" | "NFKC" | "NFKD"): string; (form?: string): string; }
padEnd: (maxLength: number, fillString?: string) => string
padStart: (maxLength: number, fillString?: string) => string
repeat: (count: number) => string
replace: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; (searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string; (searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string; }
replaceAll: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; }
search: { (regexp: string | RegExp): number; (searcher: { [Symbol.search](string: string): number; }): number; }
slice: (start?: number, end?: number) => string
small: () => string
split: { (separator: string | RegExp, limit?: number): string[]; (splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[]; }
startsWith: (searchString: string, position?: number) => boolean
strike: () => string
sub: () => string
substr: (from: number, length?: number) => string
substring: (start: number, end?: number) => string
sup: () => string
toLocaleLowerCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLocaleUpperCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLowerCase: () => string
toString: () => string
toUpperCase: () => string
trim: () => string
trimEnd: () => string
trimLeft: () => string
trimRight: () => string
trimStart: () => string
valueOf: () => string
```

## `HANDLER_TIMEOUT` (const)

```text
[iterator]: () => StringIterator<string>
anchor: (name: string) => string
at: (index: number) => string | undefined
big: () => string
blink: () => string
bold: () => string
charAt: (pos: number) => string
charCodeAt: (index: number) => number
codePointAt: (pos: number) => number | undefined
concat: (...strings: string[]) => string
endsWith: (searchString: string, endPosition?: number) => boolean
fixed: () => string
fontcolor: (color: string) => string
fontsize: { (size: number): string; (size: string): string; }
includes: (searchString: string, position?: number) => boolean
indexOf: (searchString: string, position?: number) => number
italics: () => string
lastIndexOf: (searchString: string, position?: number) => number
readonly length: number
link: (url: string) => string
localeCompare: { (that: string): number; (that: string, locales?: string | string[], options?: Intl.CollatorOptions): number; (that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number; }
match: { (regexp: string | RegExp): RegExpMatchArray | null; (matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null; }
matchAll: (regexp: RegExp) => RegExpStringIterator<RegExpExecArray>
normalize: { (form: "NFC" | "NFD" | "NFKC" | "NFKD"): string; (form?: string): string; }
padEnd: (maxLength: number, fillString?: string) => string
padStart: (maxLength: number, fillString?: string) => string
repeat: (count: number) => string
replace: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; (searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string; (searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string; }
replaceAll: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; }
search: { (regexp: string | RegExp): number; (searcher: { [Symbol.search](string: string): number; }): number; }
slice: (start?: number, end?: number) => string
small: () => string
split: { (separator: string | RegExp, limit?: number): string[]; (splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[]; }
startsWith: (searchString: string, position?: number) => boolean
strike: () => string
sub: () => string
substr: (from: number, length?: number) => string
substring: (start: number, end?: number) => string
sup: () => string
toLocaleLowerCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLocaleUpperCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLowerCase: () => string
toString: () => string
toUpperCase: () => string
trim: () => string
trimEnd: () => string
trimLeft: () => string
trimRight: () => string
trimStart: () => string
valueOf: () => string
```

## `ICancelErrorHandlerOptions` (interface)

```text
canceledStatus?: number | undefined
```

## `ICancelableHandlerOptions` (interface)

```text
extends ICancelablePromiseFlagOptions
onDisconnect?: ((reason: CancelError) => void) | undefined
onTimeout?: ((reason: CancelError) => void) | undefined
signal?: AbortSignal | Array<AbortSignal> | undefined
timeout?: TTimeoutOption | undefined
```

## `IShutdownOptions` (interface)

```text
closeServer?: boolean | undefined
reason?: string | undefined
timeout?: number | undefined
```

## `IShutdownResult` (interface)

```text
canceled: number
completed: number
timedOut: boolean
```

## `SERVER_SHUTDOWN` (const)

```text
[iterator]: () => StringIterator<string>
anchor: (name: string) => string
at: (index: number) => string | undefined
big: () => string
blink: () => string
bold: () => string
charAt: (pos: number) => string
charCodeAt: (index: number) => number
codePointAt: (pos: number) => number | undefined
concat: (...strings: string[]) => string
endsWith: (searchString: string, endPosition?: number) => boolean
fixed: () => string
fontcolor: (color: string) => string
fontsize: { (size: number): string; (size: string): string; }
includes: (searchString: string, position?: number) => boolean
indexOf: (searchString: string, position?: number) => number
italics: () => string
lastIndexOf: (searchString: string, position?: number) => number
readonly length: number
link: (url: string) => string
localeCompare: { (that: string): number; (that: string, locales?: string | string[], options?: Intl.CollatorOptions): number; (that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number; }
match: { (regexp: string | RegExp): RegExpMatchArray | null; (matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null; }
matchAll: (regexp: RegExp) => RegExpStringIterator<RegExpExecArray>
normalize: { (form: "NFC" | "NFD" | "NFKC" | "NFKD"): string; (form?: string): string; }
padEnd: (maxLength: number, fillString?: string) => string
padStart: (maxLength: number, fillString?: string) => string
repeat: (count: number) => string
replace: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; (searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string; (searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string; }
replaceAll: { (searchValue: string | RegExp, replaceValue: string): string; (searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string; }
search: { (regexp: string | RegExp): number; (searcher: { [Symbol.search](string: string): number; }): number; }
slice: (start?: number, end?: number) => string
small: () => string
split: { (separator: string | RegExp, limit?: number): string[]; (splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[]; }
startsWith: (searchString: string, position?: number) => boolean
strike: () => string
sub: () => string
substr: (from: number, length?: number) => string
substring: (start: number, end?: number) => string
sup: () => string
toLocaleLowerCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLocaleUpperCase: { (locales?: string | string[]): string; (locales?: Intl.LocalesArgument): string; }
toLowerCase: () => string
toString: () => string
toUpperCase: () => string
trim: () => string
trimEnd: () => string
trimLeft: () => string
trimRight: () => string
trimStart: () => string
valueOf: () => string
```

## `TCancelErrorHandler` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, error: unknown, request: FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGenericInterface>>, reply: FastifyReply<RouteGenericInterface, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, unknown>): void
```

## `TFastifyRouteHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (type)

```text
(this: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, request: FastifyRequest<RouteGeneric, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>>, reply: FastifyReply<RouteGeneric, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, UndefinedToUnknown<KeysOf<RouteGeneric["Reply"]> extends never ? never : RouteGeneric["Reply"]>>): ResolveFastifyReplyReturnType<FastifyTypeProviderDefault, FastifySchema, RouteGeneric>
```

## `TTimeoutOption` (type)

```text
toLocaleString: { (locales?: string | string[], options?: Intl.NumberFormatOptions): string; (locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions): string; } | (() => string)
toString: ((radix?: number) => string) | (() => string)
valueOf: (() => number) | (() => Object)
```

## `cancelErrorHandler` (function)

```text
(options?: ICancelErrorHandlerOptions | undefined): TCancelErrorHandler
```

## `cancelPlugin` (const)

```text
(instance: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, opts: ICancelableHandlerOptions): Promise<void>
```

## `cancelableHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>` (function)

```text
<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>(handler: THandlerFn<TFastifyRouteHandler<RouteGeneric>, RouteGeneric["Reply"]>, options?: ICancelableHandlerOptions | undefined): TFastifyRouteHandler<RouteGeneric>
```

## `getRequestSignal` (function)

```text
(request: Pick<FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, FastifySchema, FastifyTypeProviderDefault, unknown, FastifyBaseLogger, ResolveFastifyRequestType<FastifyTypeProviderDefault, FastifySchema, RouteGenericInterface>>, "raw">, reply: Pick<FastifyReply<RouteGenericInterface, RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, unknown, FastifySchema, FastifyTypeProviderDefault, unknown>, "raw">): CancelSignal
```

## `shutdown` (function)

```text
(app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, FastifyBaseLogger, FastifyTypeProviderDefault>, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
