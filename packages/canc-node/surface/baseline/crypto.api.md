# Public surface: @cancjs/node ./crypto

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/crypto/index.d.ts`
- Exports: 72

## `AsymmetricKeyDetails` (interface)

```text
divisorLength?: number | undefined
hashAlgorithm?: string | undefined
mgf1HashAlgorithm?: string | undefined
modulusLength?: number | undefined
namedCurve?: string | undefined
publicExponent?: bigint | undefined
saltLength?: number | undefined
```

## `BinaryLike` (type)

```text
NodeJS.ArrayBufferView<ArrayBufferLike> | string
```

## `BinaryToTextEncoding` (type)

```text
"base64" | "base64url" | "binary" | "hex"
```

## `CharacterEncoding` (type)

```text
"latin1" | "utf-16le" | "utf-8" | "utf16le" | "utf8"
```

## `CheckPrimeOptions` (interface)

```text
checks?: number | undefined
```

## `CipherCCM` (interface)

```text
extends Cipher
```

## `CipherCCMOptions` (interface)

```text
extends stream.TransformOptions
```

## `CipherCCMTypes` (type)

```text
"aes-128-ccm" | "aes-192-ccm" | "aes-256-ccm"
```

## `CipherGCM` (interface)

```text
extends Cipher
```

## `CipherGCMOptions` (interface)

```text
extends stream.TransformOptions
```

## `CipherGCMTypes` (type)

```text
"aes-128-gcm" | "aes-192-gcm" | "aes-256-gcm"
```

## `CipherKey` (type)

```text
BinaryLike | KeyObject
```

## `CipherOCB` (interface)

```text
extends Cipher
```

## `CipherOCBOptions` (interface)

```text
extends stream.TransformOptions
```

## `CipherOCBTypes` (type)

```text
"aes-128-ocb" | "aes-192-ocb" | "aes-256-ocb"
```

## `DecipherCCM` (interface)

```text
extends Decipher
```

## `DecipherGCM` (interface)

```text
extends Decipher
```

## `DecipherOCB` (interface)

```text
extends Decipher
```

## `Encoding` (type)

```text
"ascii" | "base64" | "base64url" | "binary" | "hex" | "latin1" | "ucs-2" | "ucs2" | "utf-16le" | "utf-8" | "utf16le" | "utf8"
```

## `GeneratePrimeOptions` (interface)

```text
add?: LargeNumberLike | undefined
bigint?: boolean | undefined
rem?: LargeNumberLike | undefined
safe?: boolean | undefined
```

## `GeneratePrimeOptionsArrayBuffer` (interface)

```text
extends GeneratePrimeOptions
```

## `GeneratePrimeOptionsBigInt` (interface)

```text
extends GeneratePrimeOptions
```

## `Hash` (class)

```text
extends stream.Transform
new (): Hash
```

## `HashOptions` (interface)

```text
extends stream.TransformOptions
```

## `Hmac` (class)

```text
// @deprecated
extends stream.Transform
new (): Hmac
```

## `IArgon2Params` (interface)

```text
readonly associatedData?: BinaryLike | undefined
readonly memory: number
readonly message: BinaryLike
readonly nonce: BinaryLike
readonly parallelism: number
readonly passes: number
readonly secret?: BinaryLike | undefined
readonly tagLength: number
readonly version?: number | undefined
```

## `IEncapsulateResult` (interface)

```text
readonly ciphertext: Buffer<ArrayBufferLike>
readonly sharedKey: Buffer<ArrayBufferLike>
```

## `JsonWebKeyInput` (interface)

```text
format: "jwk"
key: JsonWebKey
```

## `JwkKeyExportOptions` (interface)

```text
format: "jwk"
```

## `KeyExportOptions<T extends KeyFormat>` (interface)

```text
cipher?: string | undefined
format: T
passphrase?: Buffer<ArrayBufferLike> | string | undefined
type: "pkcs1" | "pkcs8" | "sec1" | "spki"
```

## `KeyFormat` (type)

```text
"der" | "jwk" | "pem"
```

## `KeyLike` (type)

```text
Buffer<ArrayBufferLike> | KeyObject | string
```

## `KeyObject` (class)

```text
new (): KeyObject
```

## `KeyObjectType` (type)

```text
"private" | "public" | "secret"
```

## `LargeNumberLike` (type)

```text
ArrayBuffer | NodeJS.ArrayBufferView<ArrayBufferLike> | SharedArrayBuffer | bigint
```

## `LegacyCharacterEncoding` (type)

```text
"ascii" | "binary" | "ucs-2" | "ucs2"
```

## `PrivateKeyInput` (interface)

```text
encoding?: string | undefined
format?: KeyFormat | undefined
key: Buffer<ArrayBufferLike> | string
passphrase?: Buffer<ArrayBufferLike> | string | undefined
type?: "pkcs1" | "pkcs8" | "sec1" | undefined
```

## `PublicKeyInput` (interface)

```text
encoding?: string | undefined
format?: KeyFormat | undefined
key: Buffer<ArrayBufferLike> | string
type?: "pkcs1" | "spki" | undefined
```

## `RandomUUIDOptions` (interface)

```text
disableEntropyCache?: boolean | undefined
```

## `ScryptOptions` (interface)

```text
N?: number | undefined
blockSize?: number | undefined
cost?: number | undefined
maxmem?: number | undefined
p?: number | undefined
parallelization?: number | undefined
r?: number | undefined
```

## `Sign` (class)

```text
extends stream.Writable
new (): Sign
```

## `SignKeyObjectInput` (interface)

```text
extends SigningOptions
```

## `SignPrivateKeyInput` (interface)

```text
extends PrivateKeyInput, SigningOptions
```

## `SigningOptions` (interface)

```text
dsaEncoding?: DSAEncoding | undefined
padding?: number | undefined
saltLength?: number | undefined
```

## `TKeyLike` (type)

```text
KeyObject | NodeJS.ArrayBufferView<ArrayBufferLike> | string | webcrypto.CryptoKey
```

## `Verify` (class)

```text
extends stream.Writable
new (): Verify
```

## `VerifyKeyObjectInput` (interface)

```text
extends SigningOptions
```

## `VerifyPublicKeyInput` (interface)

```text
extends PublicKeyInput, SigningOptions
```

## `argon2` (const)

```text
(algorithm: "argon2d" | "argon2i" | "argon2id", params: IArgon2Params): CancelablePromise<Buffer<ArrayBufferLike>, Unlisted>
```

## `checkPrime` (const)

```text
(candidate: LargeNumberLike): CancelablePromise<boolean, Unlisted>
(candidate: LargeNumberLike, options: CheckPrimeOptions): CancelablePromise<boolean, Unlisted>
```

## `constants` (namespace)

```text
DH_CHECK_P_NOT_PRIME: number
DH_CHECK_P_NOT_SAFE_PRIME: number
DH_NOT_SUITABLE_GENERATOR: number
DH_UNABLE_TO_CHECK_GENERATOR: number
ENGINE_METHOD_ALL: number
ENGINE_METHOD_CIPHERS: number
ENGINE_METHOD_DH: number
ENGINE_METHOD_DIGESTS: number
ENGINE_METHOD_DSA: number
ENGINE_METHOD_EC: number
ENGINE_METHOD_NONE: number
ENGINE_METHOD_PKEY_ASN1_METHS: number
ENGINE_METHOD_PKEY_METHS: number
ENGINE_METHOD_RAND: number
ENGINE_METHOD_RSA: number
OPENSSL_VERSION_NUMBER: number
POINT_CONVERSION_COMPRESSED: number
POINT_CONVERSION_HYBRID: number
POINT_CONVERSION_UNCOMPRESSED: number
RSA_NO_PADDING: number
RSA_PKCS1_OAEP_PADDING: number
RSA_PKCS1_PADDING: number
RSA_PKCS1_PSS_PADDING: number
RSA_PSS_SALTLEN_AUTO: number
RSA_PSS_SALTLEN_DIGEST: number
RSA_PSS_SALTLEN_MAX_SIGN: number
RSA_SSLV23_PADDING: number
RSA_X931_PADDING: number
SSL_OP_ALL: number
SSL_OP_ALLOW_NO_DHE_KEX: number
SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: number
SSL_OP_CIPHER_SERVER_PREFERENCE: number
SSL_OP_CISCO_ANYCONNECT: number
SSL_OP_COOKIE_EXCHANGE: number
SSL_OP_CRYPTOPRO_TLSEXT_BUG: number
SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS: number
SSL_OP_LEGACY_SERVER_CONNECT: number
SSL_OP_NO_COMPRESSION: number
SSL_OP_NO_ENCRYPT_THEN_MAC: number
SSL_OP_NO_QUERY_MTU: number
SSL_OP_NO_RENEGOTIATION: number
SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION: number
SSL_OP_NO_SSLv2: number
SSL_OP_NO_SSLv3: number
SSL_OP_NO_TICKET: number
SSL_OP_NO_TLSv1: number
SSL_OP_NO_TLSv1_1: number
SSL_OP_NO_TLSv1_2: number
SSL_OP_NO_TLSv1_3: number
SSL_OP_PRIORITIZE_CHACHA: number
SSL_OP_TLS_ROLLBACK_BUG: number
defaultCipherList: string
defaultCoreCipherList: string
```

## `createCipheriv` (function)

```text
(algorithm: CipherCCMTypes, key: CipherKey, iv: BinaryLike, options: CipherCCMOptions): CipherCCM
(algorithm: CipherOCBTypes, key: CipherKey, iv: BinaryLike, options: CipherOCBOptions): CipherOCB
(algorithm: CipherGCMTypes, key: CipherKey, iv: BinaryLike, options?: CipherGCMOptions | undefined): CipherGCM
(algorithm: "chacha20-poly1305", key: CipherKey, iv: BinaryLike, options?: CipherChaCha20Poly1305Options | undefined): CipherChaCha20Poly1305
(algorithm: string, key: CipherKey, iv: BinaryLike | null, options?: TransformOptions<Transform> | undefined): Cipher
```

## `createDecipheriv` (function)

```text
(algorithm: CipherCCMTypes, key: CipherKey, iv: BinaryLike, options: CipherCCMOptions): DecipherCCM
(algorithm: CipherOCBTypes, key: CipherKey, iv: BinaryLike, options: CipherOCBOptions): DecipherOCB
(algorithm: CipherGCMTypes, key: CipherKey, iv: BinaryLike, options?: CipherGCMOptions | undefined): DecipherGCM
(algorithm: "chacha20-poly1305", key: CipherKey, iv: BinaryLike, options?: CipherChaCha20Poly1305Options | undefined): DecipherChaCha20Poly1305
(algorithm: string, key: CipherKey, iv: BinaryLike | null, options?: TransformOptions<Transform> | undefined): Decipher
```

## `createHash` (function)

```text
(algorithm: string, options?: HashOptions | undefined): Hash
```

## `createHmac` (function)

```text
(algorithm: string, key: BinaryLike | KeyObject, options?: TransformOptions<Transform> | undefined): Hmac
```

## `createPrivateKey` (function)

```text
(key: Buffer<ArrayBufferLike> | JsonWebKeyInput | PrivateKeyInput | string): KeyObject
```

## `createPublicKey` (function)

```text
(key: Buffer<ArrayBufferLike> | JsonWebKeyInput | KeyObject | PublicKeyInput | string): KeyObject
```

## `createSecretKey` (function)

```text
(key: ArrayBufferView<ArrayBufferLike>): KeyObject
(key: string, encoding: BufferEncoding): KeyObject
```

## `createSign` (function)

```text
(algorithm: string, options?: WritableOptions<Writable> | undefined): Sign
```

## `createVerify` (function)

```text
(algorithm: string, options?: WritableOptions<Writable> | undefined): Verify
```

## `decapsulate` (const)

```text
(key: TKeyLike, ciphertext: BinaryLike): CancelablePromise<Buffer<ArrayBufferLike>, Unlisted>
```

## `encapsulate` (const)

```text
(key: TKeyLike): CancelablePromise<IEncapsulateResult, Unlisted>
```

## `generateKey` (const)

```text
(type: "aes" | "hmac", options: { length: number; }): CancelablePromise<KeyObject, Unlisted>
```

## `generateKeyPair` (const)

```text
(type: "rsa", options: IRsaKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "rsa", options: IRsaKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "rsa", options: IRsaKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "rsa", options: IRsaKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "rsa", options: IRsaKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "rsa-pss", options: IRsaPssKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "rsa-pss", options: IRsaPssKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "rsa-pss", options: IRsaPssKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "rsa-pss", options: IRsaPssKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "rsa-pss", options: IRsaPssKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "dsa", options: IDsaKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "dsa", options: IDsaKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "dsa", options: IDsaKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "dsa", options: IDsaKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "dsa", options: IDsaKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "ec", options: IEcKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "ec", options: IEcKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "ec", options: IEcKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "ec", options: IEcKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "ec", options: IEcKeyObjectOptions): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "ed25519", options: IPkcs8KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "ed25519", options: IPkcs8KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "ed25519", options: IPkcs8KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "ed25519", options: IPkcs8KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "ed25519", options?: TEmptyKeyObjectOptions | undefined): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "ed448", options: IPkcs8KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "ed448", options: IPkcs8KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "ed448", options: IPkcs8KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "ed448", options: IPkcs8KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "ed448", options?: TEmptyKeyObjectOptions | undefined): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "x25519", options: IPkcs8KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "x25519", options: IPkcs8KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "x25519", options: IPkcs8KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "x25519", options: IPkcs8KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "x25519", options?: TEmptyKeyObjectOptions | undefined): CancelablePromise<IKeyObjectPair, Unlisted>
(type: "x448", options: IPkcs8KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, Unlisted>
(type: "x448", options: IPkcs8KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "x448", options: IPkcs8KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, Unlisted>
(type: "x448", options: IPkcs8KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, Unlisted>
(type: "x448", options?: TEmptyKeyObjectOptions | undefined): CancelablePromise<IKeyObjectPair, Unlisted>
```

## `generatePrime` (const)

```text
(size: number): CancelablePromise<ArrayBuffer, Unlisted>
(size: number, options: GeneratePrimeOptionsBigInt): CancelablePromise<bigint, Unlisted>
(size: number, options: GeneratePrimeOptionsArrayBuffer): CancelablePromise<ArrayBuffer, Unlisted>
(size: number, options: GeneratePrimeOptions): CancelablePromise<ArrayBuffer | bigint, Unlisted>
```

## `hkdf` (const)

```text
(digest: string, ikm: BinaryLike | KeyObject, salt: BinaryLike, info: BinaryLike, keylen: number): CancelablePromise<ArrayBuffer, Unlisted>
```

## `pbkdf2` (const)

```text
(password: BinaryLike, salt: BinaryLike, iterations: number, keylen: number, digest: string): CancelablePromise<Buffer<ArrayBufferLike>, Unlisted>
```

## `randomBytes` (const)

```text
(size: number): CancelablePromise<Buffer<ArrayBufferLike>, Unlisted>
```

## `randomFill` (const)

```text
<T extends NodeJS.ArrayBufferView>(buffer: T): CancelablePromise<T, Unlisted>
<T extends NodeJS.ArrayBufferView>(buffer: T, offset: number): CancelablePromise<T, Unlisted>
<T extends NodeJS.ArrayBufferView>(buffer: T, offset: number, size: number): CancelablePromise<T, Unlisted>
```

## `randomUUID` (function)

```text
(options?: RandomUUIDOptions | undefined): `${string}-${string}-${string}-${string}-${string}`
```

## `scrypt` (const)

```text
(password: BinaryLike, salt: BinaryLike, keylen: number): CancelablePromise<Buffer<ArrayBufferLike>, Unlisted>
(password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions): CancelablePromise<Buffer<ArrayBufferLike>, Unlisted>
```

## `webcrypto` (namespace)

```text
CryptoKey: CryptoKeyConstructor
getRandomValues: <T extends Exclude<NodeJS.TypedArray, Float32Array | Float64Array>>(typedArray: T) => T
randomUUID: () => UUID
readonly subtle: SubtleCrypto
```
