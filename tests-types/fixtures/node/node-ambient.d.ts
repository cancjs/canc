declare module 'node:child_process' {
  export type ChildProcess = any;
  export type ExecFileOptions = any;
  export type ExecOptions = any;
  export type ForkOptions = any;
  export type SpawnOptions = any;
  export type ExecException = any;
  export type ExecFileException = any;
  export type ExecOptionsWithBufferEncoding = any;
  export type ExecOptionsWithStringEncoding = any;
  export type ExecFileOptionsWithBufferEncoding = any;
  export type ExecFileOptionsWithStringEncoding = any;
  export const spawn: any;
  export const exec: any;
  export const execFile: any;
  export const fork: any;
  const _default: any;
  export default _default;
}

declare module 'node:crypto' {
  export type BinaryLike = any;
  export type KeyObject = any;
  export type CheckPrimeOptions = any;
  export type GeneratePrimeOptions = any;
  export type GeneratePrimeOptionsArrayBuffer = any;
  export type GeneratePrimeOptionsBigInt = any;
  export type LargeNumberLike = any;
  export type ScryptOptions = any;
  export namespace webcrypto {
    type CryptoKey = any;
  }
  export type DSAKeyPairKeyObjectOptions = any;
  export type DSAKeyPairOptions<T1 = any, T2 = any> = any;
  export type ECKeyPairKeyObjectOptions = any;
  export type ECKeyPairOptions<T1 = any, T2 = any> = any;
  export type ED448KeyPairKeyObjectOptions = any;
  export type ED448KeyPairOptions<T1 = any, T2 = any> = any;
  export type ED25519KeyPairKeyObjectOptions = any;
  export type ED25519KeyPairOptions<T1 = any, T2 = any> = any;
  export type KeyPairKeyObjectResult = any;
  export type RSAKeyPairKeyObjectOptions = any;
  export type RSAKeyPairOptions<T1 = any, T2 = any> = any;
  export type RSAPSSKeyPairKeyObjectOptions = any;
  export type RSAPSSKeyPairOptions<T1 = any, T2 = any> = any;
  export type X448KeyPairKeyObjectOptions = any;
  export type X448KeyPairOptions<T1 = any, T2 = any> = any;
  export type X25519KeyPairKeyObjectOptions = any;
  export type X25519KeyPairOptions<T1 = any, T2 = any> = any;
  const _default: any;
  export default _default;
  export type AsymmetricKeyDetails = any;
  export type BinaryToTextEncoding = any;
  export type CharacterEncoding = any;
  export type CipherCCM = any;
  export type CipherCCMOptions = any;
  export type CipherCCMTypes = any;
  export type CipherChaCha20Poly1305 = any;
  export type CipherChaCha20Poly1305Options = any;
  export type CipherChaCha20Poly1305Types = any;
  export type CipherGCM = any;
  export type CipherGCMOptions = any;
  export type CipherGCMTypes = any;
  export type CipherKey = any;
  export type CipherOCB = any;
  export type CipherOCBOptions = any;
  export type CipherOCBTypes = any;
  export type DecipherCCM = any;
  export type DecipherChaCha20Poly1305 = any;
  export type DecipherGCM = any;
  export type DecipherOCB = any;
  export type Encoding = any;
  export type HashOptions = any;
  export type JsonWebKeyInput = any;
  export type JwkKeyExportOptions = any;
  export type KeyExportOptions = any;
  export type KeyFormat = any;
  export type KeyLike = any;
  export type KeyObjectType = any;
  export type LegacyCharacterEncoding = any;
  export type PrivateKeyInput = any;
  export type PublicKeyInput = any;
  export type RandomUUIDOptions = any;
  export type SignJsonWebKeyInput = any;
  export type SignKeyObjectInput = any;
  export type SignPrivateKeyInput = any;
  export type SigningOptions = any;
  export type UUID = any;
  export type VerifyJsonWebKeyInput = any;
  export type VerifyKeyObjectInput = any;
  export type VerifyPublicKeyInput = any;
  export const Hash: any;
  export const Hmac: any;
  export const Sign: any;
  export const Verify: any;
  export const constants: any;
  export const createCipheriv: any;
  export const createDecipheriv: any;
  export const createHash: any;
  export const createHmac: any;
  export const createPrivateKey: any;
  export const createPublicKey: any;
  export const createSecretKey: any;
  export const createSign: any;
  export const createVerify: any;
  export const randomUUID: any;
  export const subtle: any;
}

declare module 'node:dgram' {
  export type Socket = any;
  export type SocketOptions = any;
  export type SocketType = any;
  export type RemoteInfo = any;
  export const createSocket: any;
  const _default: any;
  export default _default;
}

declare module 'node:dns' {
  export type AnyRecord = any;
  export type CaaRecord = any;
  export type MxRecord = any;
  export type NaptrRecord = any;
  export type SoaRecord = any;
  export type SrvRecord = any;
  export type LookupAddress = any;
  export type LookupOptions = any;
  export type LookupOneOptions = any;
  export type LookupAllOptions = any;
  export type ResolverOptions = any;
  export type RecordWithTtl = any;
  export type ResolveOptions = any;
  export type ResolveWithTtlOptions = any;
  const _default: any;
  export default _default;
}

declare module 'node:dns/promises' {
  export type Resolver = any;
  const _default: any;
  export default _default;
}

declare module 'node:events' {
  export type EventEmitter = any;
  const _default: any;
  export default _default;
}

declare module 'node:fs' {
  namespace fs {
    export type StatSyncFn = any;
    export type StatsFs = any;
    export type PathLike = any;
    export type Dirent = any;
    export const Dirent: any;
    export type Stats = any;
    export const Stats: any;
    export type BigIntStats = any;
    export const constants: any;
    export const accessSync: any;
    export const appendFileSync: any;
    export const chmodSync: any;
    export const chownSync: any;
    export const closeSync: any;
    export const copyFileSync: any;
    export const cpSync: any;
    export const existsSync: any;
    export const fchmodSync: any;
    export const fchownSync: any;
    export const fdatasyncSync: any;
    export const fstatSync: any;
    export const fsyncSync: any;
    export const ftruncateSync: any;
    export const futimesSync: any;
    export const lchmodSync: any;
    export const lchownSync: any;
    export const linkSync: any;
    export const lstatSync: any;
    export const lutimesSync: any;
    export const mkdirSync: any;
    export const mkdtempSync: any;
    export const openSync: any;
    export const opendirSync: any;
    export const readFileSync: any;
    export const readdirSync: any;
    export const readlinkSync: any;
    export const readSync: any;
    export const readvSync: any;
    export const realpathSync: any;
    export const renameSync: any;
    export const rmSync: any;
    export const rmdirSync: any;
    export const statSync: any;
    export const statfsSync: any;
    export const symlinkSync: any;
    export const truncateSync: any;
    export const unlinkSync: any;
    export const utimesSync: any;
    export const writeFileSync: any;
    export const writeSync: any;
    export const writevSync: any;
    export const Dir: any;
    export type Dir = any;
  }
  export = fs;
}

declare module 'node:fs/promises' {
  export type FileHandle = any;
  const _default: any;
  export default _default;
}

declare module 'fs' {
  export type PathLike = any;
  const _default: any;
  export default _default;
}

declare module 'node:readline' {
  const _default: any;
  export default _default;
}

declare module 'node:readline/promises' {
  export type Completer = any;
  export type ReadLineOptions = any;
  export type Interface = any;
  export type Readline = any;
  const _default: any;
  export default _default;
}

declare module 'node:stream' {
  export type Readable = any;
  export type Writable = any;
  export type Duplex = any;
  export type Transform = any;
  export type PassThrough = any;
  export type DuplexOptions = any;
  export const addAbortSignal: any;
  export const duplexPair: any;
  const _default: any;
  export default _default;
}

declare module 'node:stream/promises' {
  export const finished: any;
  export const pipeline: any;
  const _default: any;
  export default _default;
}

declare module 'node:stream/consumers' {
  export const text: any;
  export const json: any;
  export const buffer: any;
  export const arrayBuffer: any;
  export const blob: any;
  const _default: any;
  export default _default;
}

declare module 'buffer' {
  export type Blob = any;
}

declare module 'node:timers' {
  const _default: any;
  export default _default;
}

declare module 'node:timers/promises' {
  const _default: any;
  export default _default;
}

declare module 'node:worker_threads' {
  export type Worker = any;
  export type WorkerOptions = any;
  export type MessageChannel = any;
  export type MessagePort = any;
  export type BroadcastChannel = any;
  export const isMainThread: any;
  export const parentPort: any;
  export const threadId: any;
  export const workerData: any;
  const _default: any;
  export default _default;
}

declare module 'node:zlib' {
  export type BrotliOptions = any;
  export type ZlibOptions = any;
  export type InputType = any;
  const _default: any;
  export default _default;
  export type Zlib = any;
  export const BrotliCompress: any;
  export const BrotliDecompress: any;
  export const Deflate: any;
  export const DeflateRaw: any;
  export const Gunzip: any;
  export const Gzip: any;
  export const Inflate: any;
  export const InflateRaw: any;
  export const Unzip: any;
  export const constants: any;
  export const createBrotliCompress: any;
  export const createBrotliDecompress: any;
  export const createDeflate: any;
  export const createDeflateRaw: any;
  export const createGunzip: any;
  export const createGzip: any;
  export const createInflate: any;
  export const createInflateRaw: any;
  export const createUnzip: any;
}

declare type Buffer = any;
declare const Buffer: any;
declare type BufferEncoding = any;
declare type NonSharedBuffer = any;
declare type Disposable = any;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
declare interface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {}
declare namespace NodeJS {
  type Signals = any;
  type ArrayBufferView = any;
  type EventEmitter = any;
  type ProcessEnv = Record<string, string | undefined>;
  type ReadableStream = any;
  type WritableStream = any;
}
