# Public surface: @cancjs/node ./dgram

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/dgram/index.d.ts`
- Exports: 9

## `DgramSocket` (class)

```text
extends EventEmitter
new (options?: EventEmitterOptions | undefined): Socket
```

## `RemoteInfo` (interface)

```text
address: string
family: "IPv4" | "IPv6"
port: number
size: number
```

## `SocketOptions` (interface)

```text
extends Abortable
```

## `SocketType` (type)

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

## `bind` (function)

```text
(socket: Socket, port?: number | undefined, addr?: string | undefined): CancelablePromise<void, never>
```

## `connect` (function)

```text
(socket: Socket, port: number, addr?: string | undefined): CancelablePromise<void, never>
```

## `createSocket` (function)

```text
(type: SocketType, callback?: ((msg: Buffer<ArrayBufferLike>, rinfo: any) => void) | undefined): Socket
(options: any, callback?: ((msg: Buffer<ArrayBufferLike>, rinfo: any) => void) | undefined): Socket
```

## `nodeCreateSocket` (function)

```text
(type: SocketType, callback?: ((msg: NonSharedBuffer, rinfo: RemoteInfo) => void) | undefined): Socket
(options: SocketOptions, callback?: ((msg: NonSharedBuffer, rinfo: RemoteInfo) => void) | undefined): Socket
```

## `send` (function)

```text
(socket: Socket, msg: string | Uint8Array<ArrayBufferLike>, offset: number, length: number, port: number, addr?: string | undefined): CancelablePromise<number, never>
(socket: Socket, msg: string | Uint8Array<ArrayBufferLike>, port: number, addr?: string | undefined): CancelablePromise<number, never>
```
