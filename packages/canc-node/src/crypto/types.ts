import type {
  BinaryLike,
  CheckPrimeOptions,
  GeneratePrimeOptions,
  GeneratePrimeOptionsArrayBuffer,
  GeneratePrimeOptionsBigInt,
  KeyObject,
  LargeNumberLike,
  ScryptOptions,
  webcrypto,
} from 'node:crypto';

import type { CancelablePromise } from '@cancjs/promise';

/** `scrypt`'s two call shapes, options bag optional in node's own overloads. */
export interface IScryptFn {
  (password: BinaryLike, salt: BinaryLike, keylen: number): CancelablePromise<Buffer>;
  (password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions): CancelablePromise<Buffer>;
}

/** `generatePrime`'s four call shapes; the result type follows the `bigint` option. */
export interface IGeneratePrimeFn {
  (size: number): CancelablePromise<ArrayBuffer>;
  (size: number, options: GeneratePrimeOptionsBigInt): CancelablePromise<bigint>;
  (size: number, options: GeneratePrimeOptionsArrayBuffer): CancelablePromise<ArrayBuffer>;
  (size: number, options: GeneratePrimeOptions): CancelablePromise<ArrayBuffer | bigint>;
}

/** `checkPrime`'s two call shapes. */
export interface ICheckPrimeFn {
  (candidate: LargeNumberLike): CancelablePromise<boolean>;
  (candidate: LargeNumberLike, options: CheckPrimeOptions): CancelablePromise<boolean>;
}

/** `randomFill`'s three call shapes, generic over the view node hands back unchanged. */
export interface IRandomFillFn {
  <T extends NodeJS.ArrayBufferView>(buffer: T): CancelablePromise<T>;
  <T extends NodeJS.ArrayBufferView>(buffer: T, offset: number): CancelablePromise<T>;
  <T extends NodeJS.ArrayBufferView>(buffer: T, offset: number, size: number): CancelablePromise<T>;
}

/**
 * A key argument accepted where node documents "public key" or "private key" without a narrower
 * published type: a PEM/DER-encoded key, a `KeyObject`, or a `CryptoKey`.
 */
export type TKeyLike = string | NodeJS.ArrayBufferView | KeyObject | webcrypto.CryptoKey;

/**
 * `argon2`'s parameters. Absent from the installed `node:crypto` typings (the function itself
 * arrived in node 24, after the installed major), so this is hand-declared from the runtime's own
 * validation errors rather than imported.
 */
export interface IArgon2Params {
  /** The password or message to hash. */
  readonly message: BinaryLike;
  /** The salt. At least 16 bytes is node's own recommendation. */
  readonly nonce: BinaryLike;
  /** Degree of parallelism. */
  readonly parallelism: number;
  /** Output key length in bytes. */
  readonly tagLength: number;
  /** Memory cost in KiB. */
  readonly memory: number;
  /** Number of passes over the memory. */
  readonly passes: number;
  /** Optional secret value (pepper). */
  readonly secret?: BinaryLike;
  /** Optional associated data, authenticated but not hashed into the output. */
  readonly associatedData?: BinaryLike;
  /** Argon2 version number. Defaults to the latest node implements. */
  readonly version?: number;
}

export type TArgon2Fn = (
  algorithm: 'argon2d' | 'argon2i' | 'argon2id',
  params: IArgon2Params,
) => CancelablePromise<Buffer>;

/** What `encapsulate` resolves: the derived shared secret plus the ciphertext to send the peer. */
export interface IEncapsulateResult {
  readonly sharedKey: Buffer;
  readonly ciphertext: Buffer;
}

export type TEncapsulateFn = (key: TKeyLike) => CancelablePromise<IEncapsulateResult>;

export type TDecapsulateFn = (key: TKeyLike, ciphertext: BinaryLike) => CancelablePromise<Buffer>;
