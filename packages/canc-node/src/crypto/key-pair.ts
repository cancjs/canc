import type {
  DSAKeyPairKeyObjectOptions,
  DSAKeyPairOptions,
  ECKeyPairKeyObjectOptions,
  ECKeyPairOptions,
  ED448KeyPairKeyObjectOptions,
  ED448KeyPairOptions,
  ED25519KeyPairKeyObjectOptions,
  ED25519KeyPairOptions,
  KeyPairKeyObjectResult,
  RSAKeyPairKeyObjectOptions,
  RSAKeyPairOptions,
  RSAPSSKeyPairKeyObjectOptions,
  RSAPSSKeyPairOptions,
  X448KeyPairKeyObjectOptions,
  X448KeyPairOptions,
  X25519KeyPairKeyObjectOptions,
  X25519KeyPairOptions,
} from 'node:crypto';

import type { CancelablePromise } from '@cancjs/promise';

/**
 * `generateKeyPair`'s signature, hand-built rather than run through the `TCancelable` ladder in
 * `./wrap.ts`.
 *
 * Node publishes 40 overloads for this one function (eight key types times five
 * encoding/KeyObject variants), and the ladder keeps only the last six signatures of whatever it is
 * given. Running this through it silently drops `rsa` and every other type but the last one
 * declared, which is a hard type error on the call this package's own users reach for first. This
 * mirrors node's own `generateKeyPair.__promisify__` overload set (`@types/node`'s stand-in for
 * `util.promisify(generateKeyPair)`) one for one, with `CancelablePromise` in place of `Promise`.
 */
export interface IGenerateKeyPairFn {
  (type: 'rsa', options: RSAKeyPairOptions<'pem', 'pem'>): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (type: 'rsa', options: RSAKeyPairOptions<'pem', 'der'>): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (type: 'rsa', options: RSAKeyPairOptions<'der', 'pem'>): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (type: 'rsa', options: RSAKeyPairOptions<'der', 'der'>): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'rsa', options: RSAKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (
    type: 'rsa-pss',
    options: RSAPSSKeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (
    type: 'rsa-pss',
    options: RSAPSSKeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (
    type: 'rsa-pss',
    options: RSAPSSKeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (
    type: 'rsa-pss',
    options: RSAPSSKeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'rsa-pss', options: RSAPSSKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (type: 'dsa', options: DSAKeyPairOptions<'pem', 'pem'>): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (type: 'dsa', options: DSAKeyPairOptions<'pem', 'der'>): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (type: 'dsa', options: DSAKeyPairOptions<'der', 'pem'>): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (type: 'dsa', options: DSAKeyPairOptions<'der', 'der'>): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'dsa', options: DSAKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (type: 'ec', options: ECKeyPairOptions<'pem', 'pem'>): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (type: 'ec', options: ECKeyPairOptions<'pem', 'der'>): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (type: 'ec', options: ECKeyPairOptions<'der', 'pem'>): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (type: 'ec', options: ECKeyPairOptions<'der', 'der'>): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'ec', options: ECKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (
    type: 'ed25519',
    options: ED25519KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (
    type: 'ed25519',
    options: ED25519KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (
    type: 'ed25519',
    options: ED25519KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (
    type: 'ed25519',
    options: ED25519KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'ed25519', options?: ED25519KeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (
    type: 'ed448',
    options: ED448KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (
    type: 'ed448',
    options: ED448KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (
    type: 'ed448',
    options: ED448KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (
    type: 'ed448',
    options: ED448KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'ed448', options?: ED448KeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (
    type: 'x25519',
    options: X25519KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (
    type: 'x25519',
    options: X25519KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (
    type: 'x25519',
    options: X25519KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (
    type: 'x25519',
    options: X25519KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'x25519', options?: X25519KeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
  (
    type: 'x448',
    options: X448KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }>;
  (
    type: 'x448',
    options: X448KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }>;
  (
    type: 'x448',
    options: X448KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }>;
  (
    type: 'x448',
    options: X448KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }>;
  (type: 'x448', options?: X448KeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult>;
}
