import type { KeyObject } from 'node:crypto';

import type { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';

// shapes are declared here, not imported: @types/node 25 dropped the names older majors export
// KeyObject exists in every major, so it is the only name taken from node

type TKeyEncodingFormat = 'pem' | 'der';

interface IPublicKeyEncoding<TFormat extends TKeyEncodingFormat, TType extends string> {
  type: TType;
  format: TFormat;
}

interface IPrivateKeyEncoding<TFormat extends TKeyEncodingFormat, TType extends string> {
  type: TType;
  format: TFormat;
  cipher?: string | undefined;
  passphrase?: string | undefined;
}

interface IKeyObjectPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

// key types with no options accept any object, or nothing at all
type TEmptyKeyObjectOptions = Record<never, never>;

interface IRsaKeyObjectOptions {
  modulusLength: number;
  publicExponent?: number | undefined;
}

interface IRsaKeyPairOptions<
  TPubFormat extends TKeyEncodingFormat,
  TPrivFormat extends TKeyEncodingFormat,
> extends IRsaKeyObjectOptions {
  publicKeyEncoding: IPublicKeyEncoding<TPubFormat, 'pkcs1' | 'spki'>;
  privateKeyEncoding: IPrivateKeyEncoding<TPrivFormat, 'pkcs1' | 'pkcs8'>;
}

interface IRsaPssKeyObjectOptions extends IRsaKeyObjectOptions {
  hashAlgorithm?: string | undefined;
  mgf1HashAlgorithm?: string | undefined;
  saltLength?: number | undefined;
}

interface IRsaPssKeyPairOptions<
  TPubFormat extends TKeyEncodingFormat,
  TPrivFormat extends TKeyEncodingFormat,
> extends IRsaPssKeyObjectOptions {
  publicKeyEncoding: IPublicKeyEncoding<TPubFormat, 'spki'>;
  privateKeyEncoding: IPrivateKeyEncoding<TPrivFormat, 'pkcs8'>;
}

interface IDsaKeyObjectOptions {
  modulusLength: number;
  divisorLength?: number | undefined;
}

interface IDsaKeyPairOptions<
  TPubFormat extends TKeyEncodingFormat,
  TPrivFormat extends TKeyEncodingFormat,
> extends IDsaKeyObjectOptions {
  publicKeyEncoding: IPublicKeyEncoding<TPubFormat, 'spki'>;
  privateKeyEncoding: IPrivateKeyEncoding<TPrivFormat, 'pkcs8'>;
}

interface IEcKeyObjectOptions {
  namedCurve: string;
  paramEncoding?: 'explicit' | 'named' | undefined;
}

interface IEcKeyPairOptions<
  TPubFormat extends TKeyEncodingFormat,
  TPrivFormat extends TKeyEncodingFormat,
> extends IEcKeyObjectOptions {
  publicKeyEncoding: IPublicKeyEncoding<TPubFormat, 'pkcs1' | 'spki'>;
  privateKeyEncoding: IPrivateKeyEncoding<TPrivFormat, 'sec1' | 'pkcs8'>;
}

// ed25519, ed448, x25519 and x448 take encodings and nothing else
interface IPkcs8KeyPairOptions<TPubFormat extends TKeyEncodingFormat, TPrivFormat extends TKeyEncodingFormat> {
  publicKeyEncoding: IPublicKeyEncoding<TPubFormat, 'spki'>;
  privateKeyEncoding: IPrivateKeyEncoding<TPrivFormat, 'pkcs8'>;
}

/**
 * `generateKeyPair`'s signature, hand-built rather than run through the `TCancelable` ladder in
 * `./wrap.ts`.
 *
 * Node publishes 40 overloads for this one function (eight key types times five
 * encoding/KeyObject variants), and the ladder keeps only the last six signatures of whatever it is
 * given. Running this through it silently drops `rsa` and every other type but the last one
 * declared, which is a hard type error on the call this package's own users reach for first. This
 * lists the same 40 overloads node's own `util.promisify` stand-in does, one for one, with
 * `CancelablePromise` in place of `Promise` and the shapes declared above.
 */
export interface IGenerateKeyPairFn {
  (
    type: 'rsa',
    options: IRsaKeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'rsa',
    options: IRsaKeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'rsa',
    options: IRsaKeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'rsa',
    options: IRsaKeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'rsa', options: IRsaKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'rsa-pss',
    options: IRsaPssKeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'rsa-pss',
    options: IRsaPssKeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'rsa-pss',
    options: IRsaPssKeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'rsa-pss',
    options: IRsaPssKeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'rsa-pss', options: IRsaPssKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'dsa',
    options: IDsaKeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'dsa',
    options: IDsaKeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'dsa',
    options: IDsaKeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'dsa',
    options: IDsaKeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'dsa', options: IDsaKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'ec',
    options: IEcKeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'ec',
    options: IEcKeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'ec',
    options: IEcKeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'ec',
    options: IEcKeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'ec', options: IEcKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'ed25519',
    options: IPkcs8KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'ed25519',
    options: IPkcs8KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'ed25519',
    options: IPkcs8KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'ed25519',
    options: IPkcs8KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'ed25519', options?: TEmptyKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'ed448',
    options: IPkcs8KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'ed448',
    options: IPkcs8KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'ed448',
    options: IPkcs8KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'ed448',
    options: IPkcs8KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'ed448', options?: TEmptyKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'x25519',
    options: IPkcs8KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'x25519',
    options: IPkcs8KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'x25519',
    options: IPkcs8KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'x25519',
    options: IPkcs8KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'x25519', options?: TEmptyKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
  (
    type: 'x448',
    options: IPkcs8KeyPairOptions<'pem', 'pem'>,
  ): CancelablePromise<{ publicKey: string; privateKey: string }, Unlisted>;
  (
    type: 'x448',
    options: IPkcs8KeyPairOptions<'pem', 'der'>,
  ): CancelablePromise<{ publicKey: string; privateKey: Buffer }, Unlisted>;
  (
    type: 'x448',
    options: IPkcs8KeyPairOptions<'der', 'pem'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: string }, Unlisted>;
  (
    type: 'x448',
    options: IPkcs8KeyPairOptions<'der', 'der'>,
  ): CancelablePromise<{ publicKey: Buffer; privateKey: Buffer }, Unlisted>;
  (type: 'x448', options?: TEmptyKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>;
}
