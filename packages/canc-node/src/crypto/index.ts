import type { BinaryLike, KeyObject } from 'node:crypto';
import nodeCrypto from 'node:crypto';

import { CancelablePromise } from '@cancjs/promise';

import { IGenerateKeyPairFn } from './key-pair';
import {
  ICheckPrimeFn,
  IGeneratePrimeFn,
  IRandomFillFn,
  IScryptFn,
  TArgon2Fn,
  TDecapsulateFn,
  TEncapsulateFn,
} from './types';
import { gatedWrapped, promisifyWrapped, TNodeFn } from './wrap';

// node's own overloads are per call site; the callback surface is read through one untyped view so
// each binding below can re-impose its own published shape on the way out
const cryptoCb = nodeCrypto as unknown as Record<string, TNodeFn>;

// argon2, encapsulate and decapsulate shipped in node 24, after the typings this package is built
// against; feature-detecting the function itself (rather than parsing process.versions.node) is
// what lets a runtime implementing the node API without claiming that version still get them
const hasArgon2 = typeof cryptoCb.argon2 === 'function';
const hasEncapsulate = typeof cryptoCb.encapsulate === 'function';
const hasDecapsulate = typeof cryptoCb.decapsulate === 'function';

/**
 * Derives a key from a password using PBKDF2.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const pbkdf2 = promisifyWrapped(cryptoCb.pbkdf2) as (
  password: BinaryLike,
  salt: BinaryLike,
  iterations: number,
  keylen: number,
  digest: string,
) => CancelablePromise<Buffer>;

/**
 * Derives a key from a password using scrypt.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const scrypt = promisifyWrapped(cryptoCb.scrypt) as IScryptFn;

/**
 * Derives a key from a password using Argon2. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Argon2 is the slowest primitive node ships, which makes it the one users most want to bound and
 * the one where the caveat below matters most.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const argon2 = gatedWrapped(hasArgon2, 'argon2', '24', promisifyWrapped(cryptoCb.argon2)) as TArgon2Fn;

/**
 * Generates a new asymmetric key pair.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
// node's callback hands back (err, publicKey, privateKey), two values after the error; the default
// promisify keeps only the first one, so the object shape node's own generateKeyPair.__promisify__
// resolves needs multiArgs spelled out by name
export const generateKeyPair = promisifyWrapped(cryptoCb.generateKeyPair, {
  multiArgs: ['publicKey', 'privateKey'],
}) as IGenerateKeyPairFn;

/**
 * Generates a new random secret key (`'hmac'` or `'aes'`).
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const generateKey = promisifyWrapped(cryptoCb.generateKey) as (
  type: 'hmac' | 'aes',
  options: { length: number },
) => CancelablePromise<KeyObject>;

/**
 * Generates a pseudorandom prime of the given bit size.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const generatePrime = promisifyWrapped(cryptoCb.generatePrime) as IGeneratePrimeFn;

/**
 * Checks the primality of a candidate.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const checkPrime = promisifyWrapped(cryptoCb.checkPrime) as ICheckPrimeFn;

/**
 * Derives a key using HKDF, as defined in RFC 5869.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const hkdf = promisifyWrapped(cryptoCb.hkdf) as (
  digest: string,
  ikm: BinaryLike | KeyObject,
  salt: BinaryLike,
  info: BinaryLike,
  keylen: number,
) => CancelablePromise<ArrayBuffer>;

/**
 * Generates cryptographically strong pseudorandom data.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const randomBytes = promisifyWrapped(cryptoCb.randomBytes) as (size: number) => CancelablePromise<Buffer>;

/**
 * Fills a typed array or `DataView` with cryptographically strong pseudorandom data.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const randomFill = promisifyWrapped(cryptoCb.randomFill) as IRandomFillFn;

/**
 * Post-quantum key encapsulation: derives a shared secret and the ciphertext to send a peer holding
 * the matching private key. Requires Node 24 or later; throws `NotImplementedError` below that,
 * driven by feature detection rather than a version parse.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const encapsulate = gatedWrapped(
  hasEncapsulate,
  'encapsulate',
  '24',
  promisifyWrapped(cryptoCb.encapsulate),
) as TEncapsulateFn;

/**
 * Post-quantum key decapsulation: recovers the shared secret `encapsulate` derived, from the
 * matching private key and the ciphertext it produced. Requires Node 24 or later; throws
 * `NotImplementedError` below that, driven by feature detection rather than a version parse.
 *
 * Canceling stops the wait, not the work: the call keeps running on node's threadpool and the slot
 * it holds there stays occupied until it finishes.
 */
export const decapsulate = gatedWrapped(
  hasDecapsulate,
  'decapsulate',
  '24',
  promisifyWrapped(cryptoCb.decapsulate),
) as TDecapsulateFn;

export type { IArgon2Params, IEncapsulateResult, TKeyLike } from './types';

// the synchronous factory surface (createHash, createCipheriv, randomUUID, webcrypto, constants,
// and everything else node:crypto exports that never had a callback form) passes through
// untouched, so a caller building a cipher or hash is not forced into a second import for one
// operation; the promisified bindings above are declared locally and win over this star re-export
// for every name they share, per the language's own name resolution rather than any ordering trick
export * from 'node:crypto';
