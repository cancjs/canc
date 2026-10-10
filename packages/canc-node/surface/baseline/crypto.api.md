# Public surface: @cancjs/node ./crypto

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/crypto/index.d.ts`
- Exports: 153

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

## `BasePrivateKeyEncodingOptions<T extends KeyFormat>` (interface)

```text
cipher?: string | undefined
format: T
passphrase?: string | undefined
```

## `BinaryLike` (type)

```text
string | NodeJS.ArrayBufferView<ArrayBufferLike>
```

## `BinaryToTextEncoding` (type)

```text
"base64" | "base64url" | "binary" | "hex"
```

## `Certificate` (class)

```text
new (): Certificate
```

## `CharacterEncoding` (type)

```text
"utf8" | "utf-8" | "utf16le" | "utf-16le" | "latin1"
```

## `CheckPrimeOptions` (interface)

```text
checks?: number | undefined
```

## `Cipher` (class)

```text
extends stream.Transform
new (): Cipher
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

## `CipherChaCha20Poly1305` (interface)

```text
extends Cipher
```

## `CipherChaCha20Poly1305Options` (interface)

```text
extends stream.TransformOptions
```

## `CipherChaCha20Poly1305Types` (type)

```text
"chacha20-poly1305"
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

## `CipherInfo` (interface)

```text
blockSize?: number | undefined
ivLength?: number | undefined
keyLength: number
mode: CipherMode
name: string
nid: number
```

## `CipherInfoOptions` (interface)

```text
ivLength?: number | undefined
keyLength?: number | undefined
```

## `CipherKey` (type)

```text
BinaryLike | KeyObject
```

## `CipherMode` (type)

```text
"cbc" | "ccm" | "cfb" | "ctr" | "ecb" | "gcm" | "ocb" | "ofb" | "stream" | "wrap" | "xts"
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

## `DSAEncoding` (type)

```text
"der" | "ieee-p1363"
```

## `DSAKeyPairKeyObjectOptions` (interface)

```text
divisorLength: number
modulusLength: number
```

## `DSAKeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
divisorLength: number
modulusLength: number
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs8"; }
publicKeyEncoding: { type: "spki"; format: PubF; }
```

## `Decipher` (class)

```text
extends stream.Transform
new (): Decipher
```

## `DecipherCCM` (interface)

```text
extends Decipher
```

## `DecipherChaCha20Poly1305` (interface)

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

## `DiffieHellman` (class)

```text
new (): DiffieHellman
```

## `DiffieHellmanGroup` (type)

```text
computeSecret: { (otherPublicKey: NodeJS.ArrayBufferView, inputEncoding?: null, outputEncoding?: null): NonSharedBuffer; (otherPublicKey: string, inputEncoding: BinaryToTextEncoding, outputEncoding?: null): NonSharedBuffer; (otherPublicKey: NodeJS.ArrayBufferView, inputEncoding: null, outputEncoding: BinaryToTextEncoding): string; (otherPublicKey: string, inputEncoding: BinaryToTextEncoding, outputEncoding: BinaryToTextEncoding): string; }
generateKeys: { (): NonSharedBuffer; (encoding: BinaryToTextEncoding): string; }
getGenerator: { (): NonSharedBuffer; (encoding: BinaryToTextEncoding): string; }
getPrime: { (): NonSharedBuffer; (encoding: BinaryToTextEncoding): string; }
getPrivateKey: { (): NonSharedBuffer; (encoding: BinaryToTextEncoding): string; }
getPublicKey: { (): NonSharedBuffer; (encoding: BinaryToTextEncoding): string; }
verifyError: number
```

## `DiffieHellmanGroupConstructor` (interface)

```text
new (name: string): DiffieHellmanGroup
(name: string): DiffieHellmanGroup
```

## `ECDH` (class)

```text
new (): ECDH
```

## `ECDHKeyFormat` (type)

```text
"compressed" | "uncompressed" | "hybrid"
```

## `ECKeyPairKeyObjectOptions` (interface)

```text
namedCurve: string
paramEncoding?: "explicit" | "named" | undefined
```

## `ECKeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
extends ECKeyPairKeyObjectOptions
```

## `ED25519KeyPairKeyObjectOptions` (interface)

```text
ED25519KeyPairKeyObjectOptions
```

## `ED25519KeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs8"; }
publicKeyEncoding: { type: "spki"; format: PubF; }
```

## `ED448KeyPairKeyObjectOptions` (interface)

```text
ED448KeyPairKeyObjectOptions
```

## `ED448KeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs8"; }
publicKeyEncoding: { type: "spki"; format: PubF; }
```

## `Encoding` (type)

```text
"ascii" | "utf8" | "utf-8" | "utf16le" | "utf-16le" | "ucs2" | "ucs-2" | "base64" | "base64url" | "latin1" | "binary" | "hex"
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

## `JsonWebKey` (interface)

```text
crv?: string | undefined
d?: string | undefined
dp?: string | undefined
dq?: string | undefined
e?: string | undefined
k?: string | undefined
kty?: string | undefined
n?: string | undefined
p?: string | undefined
q?: string | undefined
qi?: string | undefined
x?: string | undefined
y?: string | undefined
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
passphrase?: string | Buffer<ArrayBufferLike> | undefined
type: "pkcs1" | "spki" | "pkcs8" | "sec1"
```

## `KeyFormat` (type)

```text
"pem" | "der" | "jwk"
```

## `KeyLike` (type)

```text
string | KeyObject | Buffer<ArrayBufferLike>
```

## `KeyObject` (class)

```text
new (): KeyObject
```

## `KeyObjectType` (type)

```text
"secret" | "public" | "private"
```

## `KeyPairKeyObjectResult` (interface)

```text
privateKey: KeyObject
publicKey: KeyObject
```

## `KeyPairSyncResult<T1 extends string | Buffer, T2 extends string | Buffer>` (interface)

```text
privateKey: T2
publicKey: T1
```

## `KeyType` (type)

```text
"rsa" | "rsa-pss" | "dsa" | "ec" | "ed25519" | "ed448" | "x25519" | "x448"
```

## `LargeNumberLike` (type)

```text
bigint | ArrayBuffer | SharedArrayBuffer | NodeJS.ArrayBufferView<ArrayBufferLike>
```

## `LegacyCharacterEncoding` (type)

```text
"ascii" | "ucs2" | "ucs-2" | "binary"
```

## `PrivateKeyInput` (interface)

```text
encoding?: string | undefined
format?: KeyFormat | undefined
key: string | Buffer<ArrayBufferLike>
passphrase?: string | Buffer<ArrayBufferLike> | undefined
type?: "pkcs1" | "pkcs8" | "sec1" | undefined
```

## `PublicKeyInput` (interface)

```text
encoding?: string | undefined
format?: KeyFormat | undefined
key: string | Buffer<ArrayBufferLike>
type?: "pkcs1" | "spki" | undefined
```

## `RSAKeyPairKeyObjectOptions` (interface)

```text
modulusLength: number
publicExponent?: number | undefined
```

## `RSAKeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
modulusLength: number
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs1" | "pkcs8"; }
publicExponent?: number | undefined
publicKeyEncoding: { type: "pkcs1" | "spki"; format: PubF; }
```

## `RSAPSSKeyPairKeyObjectOptions` (interface)

```text
hashAlgorithm?: string | undefined
mgf1HashAlgorithm?: string | undefined
modulusLength: number
publicExponent?: number | undefined
saltLength?: string | undefined
```

## `RSAPSSKeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
hashAlgorithm?: string | undefined
mgf1HashAlgorithm?: string | undefined
modulusLength: number
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs8"; }
publicExponent?: number | undefined
publicKeyEncoding: { type: "spki"; format: PubF; }
saltLength?: string | undefined
```

## `RandomUUIDOptions` (interface)

```text
disableEntropyCache?: boolean | undefined
```

## `RsaPrivateKey` (interface)

```text
key: KeyLike
oaepHash?: string | undefined
oaepLabel?: NodeJS.TypedArray<ArrayBufferLike> | undefined
padding?: number | undefined
passphrase?: string | undefined
```

## `RsaPublicKey` (interface)

```text
key: KeyLike
padding?: number | undefined
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

## `SecureHeapUsage` (interface)

```text
min: number
total: number
used: number
utilization: number
```

## `Sign` (class)

```text
extends stream.Writable
new (): Sign
```

## `SignJsonWebKeyInput` (interface)

```text
extends JsonWebKeyInput, SigningOptions
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
string | NodeJS.ArrayBufferView<ArrayBufferLike> | KeyObject | webcrypto.CryptoKey
```

## `UUID` (type)

```text
`${string}-${string}-${string}-${string}-${string}`
```

## `Verify` (class)

```text
extends stream.Writable
new (): Verify
```

## `VerifyJsonWebKeyInput` (interface)

```text
extends JsonWebKeyInput, SigningOptions
```

## `VerifyKeyObjectInput` (interface)

```text
extends SigningOptions
```

## `VerifyPublicKeyInput` (interface)

```text
extends PublicKeyInput, SigningOptions
```

## `X25519KeyPairKeyObjectOptions` (interface)

```text
X25519KeyPairKeyObjectOptions
```

## `X25519KeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs8"; }
publicKeyEncoding: { type: "spki"; format: PubF; }
```

## `X448KeyPairKeyObjectOptions` (interface)

```text
X448KeyPairKeyObjectOptions
```

## `X448KeyPairOptions<PubF extends KeyFormat, PrivF extends KeyFormat>` (interface)

```text
privateKeyEncoding: BasePrivateKeyEncodingOptions<PrivF> & { type: "pkcs8"; }
publicKeyEncoding: { type: "spki"; format: PubF; }
```

## `X509Certificate` (class)

```text
new (buffer: BinaryLike): X509Certificate
```

## `X509CheckOptions` (interface)

```text
multiLabelWildcards?: boolean | undefined
partialWildcards?: boolean | undefined
singleLabelSubdomains?: boolean | undefined
subject?: "default" | "always" | "never" | undefined
wildcards?: boolean | undefined
```

## `argon2` (const)

```text
(algorithm: "argon2d" | "argon2i" | "argon2id", params: IArgon2Params): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `checkPrime` (const)

```text
(candidate: LargeNumberLike): CancelablePromise<boolean, never>
(candidate: LargeNumberLike, options: CheckPrimeOptions): CancelablePromise<boolean, never>
```

## `checkPrimeSync` (function)

```text
(candidate: LargeNumberLike, options?: CheckPrimeOptions | undefined): boolean
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

## `createCipher` (function)

```text
// @deprecated
(algorithm: CipherCCMTypes, password: BinaryLike, options: CipherCCMOptions): CipherCCM // @deprecated
(algorithm: CipherGCMTypes, password: BinaryLike, options?: CipherGCMOptions | undefined): CipherGCM // @deprecated
(algorithm: CipherOCBTypes, password: BinaryLike, options: CipherOCBOptions): CipherOCB // @deprecated
(algorithm: "chacha20-poly1305", password: BinaryLike, options?: CipherChaCha20Poly1305Options | undefined): CipherChaCha20Poly1305 // @deprecated
(algorithm: string, password: BinaryLike, options?: TransformOptions<Transform> | undefined): Cipher // @deprecated
```

## `createCipheriv` (function)

```text
(algorithm: CipherCCMTypes, key: CipherKey, iv: BinaryLike, options: CipherCCMOptions): CipherCCM
(algorithm: CipherOCBTypes, key: CipherKey, iv: BinaryLike, options: CipherOCBOptions): CipherOCB
(algorithm: CipherGCMTypes, key: CipherKey, iv: BinaryLike, options?: CipherGCMOptions | undefined): CipherGCM
(algorithm: "chacha20-poly1305", key: CipherKey, iv: BinaryLike, options?: CipherChaCha20Poly1305Options | undefined): CipherChaCha20Poly1305
(algorithm: string, key: CipherKey, iv: BinaryLike | null, options?: TransformOptions<Transform> | undefined): Cipher
```

## `createDecipher` (function)

```text
// @deprecated
(algorithm: CipherCCMTypes, password: BinaryLike, options: CipherCCMOptions): DecipherCCM // @deprecated
(algorithm: CipherGCMTypes, password: BinaryLike, options?: CipherGCMOptions | undefined): DecipherGCM // @deprecated
(algorithm: CipherOCBTypes, password: BinaryLike, options: CipherOCBOptions): DecipherOCB // @deprecated
(algorithm: "chacha20-poly1305", password: BinaryLike, options?: CipherChaCha20Poly1305Options | undefined): DecipherChaCha20Poly1305 // @deprecated
(algorithm: string, password: BinaryLike, options?: TransformOptions<Transform> | undefined): Decipher // @deprecated
```

## `createDecipheriv` (function)

```text
(algorithm: CipherCCMTypes, key: CipherKey, iv: BinaryLike, options: CipherCCMOptions): DecipherCCM
(algorithm: CipherOCBTypes, key: CipherKey, iv: BinaryLike, options: CipherOCBOptions): DecipherOCB
(algorithm: CipherGCMTypes, key: CipherKey, iv: BinaryLike, options?: CipherGCMOptions | undefined): DecipherGCM
(algorithm: "chacha20-poly1305", key: CipherKey, iv: BinaryLike, options?: CipherChaCha20Poly1305Options | undefined): DecipherChaCha20Poly1305
(algorithm: string, key: CipherKey, iv: BinaryLike | null, options?: TransformOptions<Transform> | undefined): Decipher
```

## `createDiffieHellman` (function)

```text
(primeLength: number, generator?: number | undefined): DiffieHellman
(prime: ArrayBuffer | ArrayBufferView<ArrayBufferLike>, generator?: number | ArrayBuffer | ArrayBufferView<ArrayBufferLike> | undefined): DiffieHellman
(prime: ArrayBuffer | ArrayBufferView<ArrayBufferLike>, generator: string, generatorEncoding: BinaryToTextEncoding): DiffieHellman
(prime: string, primeEncoding: BinaryToTextEncoding, generator?: number | ArrayBuffer | ArrayBufferView<ArrayBufferLike> | undefined): DiffieHellman
(prime: string, primeEncoding: BinaryToTextEncoding, generator: string, generatorEncoding: BinaryToTextEncoding): DiffieHellman
```

## `createDiffieHellmanGroup` (function)

```text
(name: string): DiffieHellmanGroup
```

## `createECDH` (function)

```text
(curveName: string): ECDH
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
(key: string | Buffer<ArrayBufferLike> | PrivateKeyInput | JsonWebKeyInput): KeyObject
```

## `createPublicKey` (function)

```text
(key: string | Buffer<ArrayBufferLike> | KeyObject | JsonWebKeyInput | PublicKeyInput): KeyObject
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
(key: TKeyLike, ciphertext: BinaryLike): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `diffieHellman` (function)

```text
(options: { privateKey: KeyObject; publicKey: KeyObject; }): NonSharedBuffer
```

## `encapsulate` (const)

```text
(key: TKeyLike): CancelablePromise<IEncapsulateResult, never>
```

## `fips` (const)

```text
// @deprecated
boolean
```

## `generateKey` (const)

```text
(type: "hmac" | "aes", options: { length: number; }): CancelablePromise<KeyObject, never>
```

## `generateKeyPair` (const)

```text
(type: "rsa", options: RSAKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "rsa", options: RSAKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "rsa", options: RSAKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "rsa", options: RSAKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "rsa", options: RSAKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "rsa-pss", options: RSAPSSKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "dsa", options: DSAKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "dsa", options: DSAKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "dsa", options: DSAKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "dsa", options: DSAKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "dsa", options: DSAKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "ec", options: ECKeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "ec", options: ECKeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "ec", options: ECKeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "ec", options: ECKeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "ec", options: ECKeyPairKeyObjectOptions): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "ed25519", options: ED25519KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "ed25519", options: ED25519KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "ed25519", options: ED25519KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "ed25519", options: ED25519KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "ed25519", options?: ED25519KeyPairKeyObjectOptions | undefined): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "ed448", options: ED448KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "ed448", options: ED448KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "ed448", options: ED448KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "ed448", options: ED448KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "ed448", options?: ED448KeyPairKeyObjectOptions | undefined): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "x25519", options: X25519KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "x25519", options: X25519KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "x25519", options: X25519KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "x25519", options: X25519KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "x25519", options?: X25519KeyPairKeyObjectOptions | undefined): CancelablePromise<KeyPairKeyObjectResult, never>
(type: "x448", options: X448KeyPairOptions<"pem", "pem">): CancelablePromise<{ publicKey: string; privateKey: string; }, never>
(type: "x448", options: X448KeyPairOptions<"pem", "der">): CancelablePromise<{ publicKey: string; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "x448", options: X448KeyPairOptions<"der", "pem">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: string; }, never>
(type: "x448", options: X448KeyPairOptions<"der", "der">): CancelablePromise<{ publicKey: Buffer<ArrayBufferLike>; privateKey: Buffer<ArrayBufferLike>; }, never>
(type: "x448", options?: X448KeyPairKeyObjectOptions | undefined): CancelablePromise<KeyPairKeyObjectResult, never>
```

## `generateKeyPairSync` (function)

```text
(type: "rsa", options: RSAKeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "rsa", options: RSAKeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "rsa", options: RSAKeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "rsa", options: RSAKeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "rsa", options: RSAKeyPairKeyObjectOptions): KeyPairKeyObjectResult
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "rsa-pss", options: RSAPSSKeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "rsa-pss", options: RSAPSSKeyPairKeyObjectOptions): KeyPairKeyObjectResult
(type: "dsa", options: DSAKeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "dsa", options: DSAKeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "dsa", options: DSAKeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "dsa", options: DSAKeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "dsa", options: DSAKeyPairKeyObjectOptions): KeyPairKeyObjectResult
(type: "ec", options: ECKeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "ec", options: ECKeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "ec", options: ECKeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "ec", options: ECKeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "ec", options: ECKeyPairKeyObjectOptions): KeyPairKeyObjectResult
(type: "ed25519", options: ED25519KeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "ed25519", options: ED25519KeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "ed25519", options: ED25519KeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "ed25519", options: ED25519KeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "ed25519", options?: ED25519KeyPairKeyObjectOptions | undefined): KeyPairKeyObjectResult
(type: "ed448", options: ED448KeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "ed448", options: ED448KeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "ed448", options: ED448KeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "ed448", options: ED448KeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "ed448", options?: ED448KeyPairKeyObjectOptions | undefined): KeyPairKeyObjectResult
(type: "x25519", options: X25519KeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "x25519", options: X25519KeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "x25519", options: X25519KeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "x25519", options: X25519KeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "x25519", options?: X25519KeyPairKeyObjectOptions | undefined): KeyPairKeyObjectResult
(type: "x448", options: X448KeyPairOptions<"pem", "pem">): KeyPairSyncResult<string, string>
(type: "x448", options: X448KeyPairOptions<"pem", "der">): KeyPairSyncResult<string, NonSharedBuffer>
(type: "x448", options: X448KeyPairOptions<"der", "pem">): KeyPairSyncResult<NonSharedBuffer, string>
(type: "x448", options: X448KeyPairOptions<"der", "der">): KeyPairSyncResult<NonSharedBuffer, NonSharedBuffer>
(type: "x448", options?: X448KeyPairKeyObjectOptions | undefined): KeyPairKeyObjectResult
```

## `generateKeySync` (function)

```text
(type: "hmac" | "aes", options: { length: number; }): KeyObject
```

## `generatePrime` (const)

```text
(size: number): CancelablePromise<ArrayBuffer, never>
(size: number, options: GeneratePrimeOptionsBigInt): CancelablePromise<bigint, never>
(size: number, options: GeneratePrimeOptionsArrayBuffer): CancelablePromise<ArrayBuffer, never>
(size: number, options: GeneratePrimeOptions): CancelablePromise<bigint | ArrayBuffer, never>
```

## `generatePrimeSync` (function)

```text
(size: number): ArrayBuffer
(size: number, options: GeneratePrimeOptionsBigInt): bigint
(size: number, options: GeneratePrimeOptionsArrayBuffer): ArrayBuffer
(size: number, options: GeneratePrimeOptions): bigint | ArrayBuffer
```

## `getCipherInfo` (function)

```text
(nameOrNid: string | number, options?: CipherInfoOptions | undefined): CipherInfo | undefined
```

## `getCiphers` (function)

```text
(): Array<string>
```

## `getCurves` (function)

```text
(): Array<string>
```

## `getDiffieHellman` (function)

```text
(groupName: string): DiffieHellmanGroup
```

## `getFips` (function)

```text
(): 0 | 1
```

## `getHashes` (function)

```text
(): Array<string>
```

## `getRandomValues<T extends webcrypto.BufferSource>` (function)

```text
<T extends webcrypto.BufferSource>(typedArray: T): T
```

## `hash` (function)

```text
(algorithm: string, data: BinaryLike, outputEncoding?: BinaryToTextEncoding | undefined): string
(algorithm: string, data: BinaryLike, outputEncoding: "buffer"): NonSharedBuffer
(algorithm: string, data: BinaryLike, outputEncoding?: BinaryToTextEncoding | "buffer" | undefined): string | NonSharedBuffer
```

## `hkdf` (const)

```text
(digest: string, ikm: BinaryLike | KeyObject, salt: BinaryLike, info: BinaryLike, keylen: number): CancelablePromise<ArrayBuffer, never>
```

## `hkdfSync` (function)

```text
(digest: string, ikm: BinaryLike | KeyObject, salt: BinaryLike, info: BinaryLike, keylen: number): ArrayBuffer
```

## `pbkdf2` (const)

```text
(password: BinaryLike, salt: BinaryLike, iterations: number, keylen: number, digest: string): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `pbkdf2Sync` (function)

```text
(password: BinaryLike, salt: BinaryLike, iterations: number, keylen: number, digest: string): NonSharedBuffer
```

## `privateDecrypt` (function)

```text
(privateKey: RsaPrivateKey | KeyLike, buffer: ArrayBufferView<ArrayBufferLike>): NonSharedBuffer
```

## `privateEncrypt` (function)

```text
(privateKey: RsaPrivateKey | KeyLike, buffer: ArrayBufferView<ArrayBufferLike>): NonSharedBuffer
```

## `pseudoRandomBytes` (function)

```text
(size: number): NonSharedBuffer
(size: number, callback: (err: Error | null, buf: NonSharedBuffer) => void): void
```

## `publicDecrypt` (function)

```text
(key: RsaPublicKey | RsaPrivateKey | KeyLike, buffer: ArrayBufferView<ArrayBufferLike>): NonSharedBuffer
```

## `publicEncrypt` (function)

```text
(key: RsaPublicKey | RsaPrivateKey | KeyLike, buffer: ArrayBufferView<ArrayBufferLike>): NonSharedBuffer
```

## `randomBytes` (const)

```text
(size: number): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `randomFill` (const)

```text
<T extends NodeJS.ArrayBufferView>(buffer: T): CancelablePromise<T, never>
<T extends NodeJS.ArrayBufferView>(buffer: T, offset: number): CancelablePromise<T, never>
<T extends NodeJS.ArrayBufferView>(buffer: T, offset: number, size: number): CancelablePromise<T, never>
```

## `randomFillSync<T extends NodeJS.ArrayBufferView>` (function)

```text
<T extends NodeJS.ArrayBufferView>(buffer: T, offset?: number | undefined, size?: number | undefined): T
```

## `randomInt` (function)

```text
(max: number): number
(min: number, max: number): number
(max: number, callback: (err: Error | null, value: number) => void): void
(min: number, max: number, callback: (err: Error | null, value: number) => void): void
```

## `randomUUID` (function)

```text
(options?: RandomUUIDOptions | undefined): `${string}-${string}-${string}-${string}-${string}`
```

## `scrypt` (const)

```text
(password: BinaryLike, salt: BinaryLike, keylen: number): CancelablePromise<Buffer<ArrayBufferLike>, never>
(password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions): CancelablePromise<Buffer<ArrayBufferLike>, never>
```

## `scryptSync` (function)

```text
(password: BinaryLike, salt: BinaryLike, keylen: number, options?: ScryptOptions | undefined): NonSharedBuffer
```

## `secureHeapUsed` (function)

```text
(): SecureHeapUsage
```

## `setEngine` (function)

```text
(engine: string, flags?: number | undefined): void
```

## `setFips` (function)

```text
(bool: boolean): void
```

## `sign` (function)

```text
(algorithm: string | null | undefined, data: ArrayBufferView<ArrayBufferLike>, key: KeyLike | SignKeyObjectInput | SignPrivateKeyInput | SignJsonWebKeyInput): NonSharedBuffer
(algorithm: string | null | undefined, data: ArrayBufferView<ArrayBufferLike>, key: KeyLike | SignKeyObjectInput | SignPrivateKeyInput | SignJsonWebKeyInput, callback: (error: Error | null, data: NonSharedBuffer) => void): void
```

## `subtle` (const)

```text
decrypt: (algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams, key: CryptoKey, data: BufferSource) => Promise<ArrayBuffer>
deriveBits: { (algorithm: EcdhKeyDeriveParams, baseKey: CryptoKey, length: number | null): Promise<ArrayBuffer>; (algorithm: AlgorithmIdentifier | HkdfParams | Pbkdf2Params, baseKey: CryptoKey, length: number): Promise<ArrayBuffer>; }
deriveKey: (algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params, baseKey: CryptoKey, derivedKeyAlgorithm: AlgorithmIdentifier | AesDerivedKeyParams | HmacImportParams | HkdfParams | Pbkdf2Params, extractable: boolean, keyUsages: readonly KeyUsage[]) => Promise<CryptoKey>
digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>
encrypt: (algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams, key: CryptoKey, data: BufferSource) => Promise<ArrayBuffer>
exportKey: { (format: "jwk", key: CryptoKey): Promise<JsonWebKey>; (format: Exclude<KeyFormat, "jwk">, key: CryptoKey): Promise<ArrayBuffer>; }
generateKey: { (algorithm: RsaHashedKeyGenParams | EcKeyGenParams, extractable: boolean, keyUsages: readonly KeyUsage[]): Promise<CryptoKeyPair>; (algorithm: AesKeyGenParams | HmacKeyGenParams | Pbkdf2Params, extractable: boolean, keyUsages: readonly KeyUsage[]): Promise<CryptoKey>; (algorithm: AlgorithmIdentifier, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKeyPair | CryptoKey>; }
importKey: { (format: "jwk", keyData: JsonWebKey, algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm, extractable: boolean, keyUsages: readonly KeyUsage[]): Promise<CryptoKey>; (format: Exclude<KeyFormat, "jwk">, keyData: BufferSource, algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm, extractable: boolean, keyUsages: KeyUsage[]): Promise<CryptoKey>; }
sign: (algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams | Ed448Params, key: CryptoKey, data: BufferSource) => Promise<ArrayBuffer>
unwrapKey: (format: KeyFormat, wrappedKey: BufferSource, unwrappingKey: CryptoKey, unwrapAlgorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams, unwrappedKeyAlgorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm, extractable: boolean, keyUsages: KeyUsage[]) => Promise<CryptoKey>
verify: (algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams | Ed448Params, key: CryptoKey, signature: BufferSource, data: BufferSource) => Promise<boolean>
wrapKey: (format: KeyFormat, key: CryptoKey, wrappingKey: CryptoKey, wrapAlgorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams) => Promise<ArrayBuffer>
```

## `timingSafeEqual` (function)

```text
(a: ArrayBufferView<ArrayBufferLike>, b: ArrayBufferView<ArrayBufferLike>): boolean
```

## `verify` (function)

```text
(algorithm: string | null | undefined, data: ArrayBufferView<ArrayBufferLike>, key: KeyLike | VerifyKeyObjectInput | VerifyPublicKeyInput | VerifyJsonWebKeyInput, signature: ArrayBufferView<ArrayBufferLike>): boolean
(algorithm: string | null | undefined, data: ArrayBufferView<ArrayBufferLike>, key: KeyLike | VerifyKeyObjectInput | VerifyPublicKeyInput | VerifyJsonWebKeyInput, signature: ArrayBufferView<ArrayBufferLike>, callback: (error: Error | null, result: boolean) => void): void
```

## `webcrypto` (namespace)

```text
CryptoKey: CryptoKeyConstructor
getRandomValues: <T extends Exclude<NodeJS.TypedArray, Float32Array | Float64Array>>(typedArray: T) => T
randomUUID: () => UUID
readonly subtle: SubtleCrypto
```
