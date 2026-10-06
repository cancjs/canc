# Public surface: @cancjs/server-koa .

Generated. Do not edit by hand.

- Declarations: `packages/canc-server/canc-server-koa/dist/types/index.d.ts`
- Exports: 10

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

## `cancelMiddleware<StateT = DefaultState, ContextT = DefaultContext>` (function)

```text
<StateT = DefaultState, ContextT = DefaultContext>(options?: ICancelableHandlerOptions | undefined): Middleware<StateT, ContextT>
```

## `cancelableHandler<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>` (function)

```text
<StateT = DefaultState, ContextT = DefaultContext, ResponseBodyT = unknown>(handler: THandlerFn<(ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => any>, options?: ICancelableHandlerOptions | undefined): (ctx: ParameterizedContext<StateT, ContextT, ResponseBodyT>) => Promise<void>
```

## `getRequestSignal` (function)

```text
(ctx: Context): CancelSignal
```

## `shutdown` (function)

```text
(server: Server<typeof IncomingMessage, typeof ServerResponse>, options?: IShutdownOptions | undefined): Promise<IShutdownResult>
```
