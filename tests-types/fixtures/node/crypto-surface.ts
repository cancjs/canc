import type {
  AsymmetricKeyDetails,
  BinaryLike,
  BinaryToTextEncoding,
  CharacterEncoding,
  CheckPrimeOptions,
  CipherCCM,
  CipherCCMOptions,
  CipherCCMTypes,
  CipherGCM,
  CipherGCMOptions,
  CipherGCMTypes,
  CipherKey,
  CipherOCB,
  CipherOCBOptions,
  CipherOCBTypes,
  DecipherCCM,
  DecipherGCM,
  DecipherOCB,
  Encoding,
  GeneratePrimeOptions,
  GeneratePrimeOptionsArrayBuffer,
  GeneratePrimeOptionsBigInt,
  HashOptions,
  IArgon2Params,
  IEncapsulateResult,
  JsonWebKeyInput,
  JwkKeyExportOptions,
  KeyExportOptions,
  KeyFormat,
  KeyLike,
  KeyObjectType,
  LargeNumberLike,
  LegacyCharacterEncoding,
  PrivateKeyInput,
  PublicKeyInput,
  RandomUUIDOptions,
  ScryptOptions,
  SignKeyObjectInput,
  SignPrivateKeyInput,
  SigningOptions,
  TKeyLike,
  VerifyKeyObjectInput,
  VerifyPublicKeyInput,
} from '@cancjs/node/crypto';
import {
  Hash,
  Hmac,
  KeyObject,
  Sign,
  Verify,
  argon2,
  checkPrime,
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSecretKey,
  createSign,
  createVerify,
  decapsulate,
  encapsulate,
  generateKey,
  generateKeyPair,
  generatePrime,
  hkdf,
  pbkdf2,
  randomBytes,
  randomFill,
  randomUUID,
  scrypt,
  webcrypto,
} from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { CipherChaCha20Poly1305 } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { CipherChaCha20Poly1305Options } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { CipherChaCha20Poly1305Types } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { DecipherChaCha20Poly1305 } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { SignJsonWebKeyInput } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { UUID } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { VerifyJsonWebKeyInput } from '@cancjs/node/crypto';
// @ts-expect-error Removed native re-export
import type { subtle } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { BasePrivateKeyEncodingOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { Certificate } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { Cipher } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { CipherInfo } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { CipherInfoOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { CipherMode } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { DSAEncoding } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { DSAKeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { DSAKeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { Decipher } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { DiffieHellman } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { DiffieHellmanGroup } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { DiffieHellmanGroupConstructor } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ECDH } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ECDHKeyFormat } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ECKeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ECKeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ED25519KeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ED25519KeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ED448KeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { ED448KeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { JsonWebKey } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { KeyPairKeyObjectResult } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { KeyPairSyncResult } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { KeyType } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { RSAKeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { RSAKeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { RSAPSSKeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { RSAPSSKeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { RsaPrivateKey } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { RsaPublicKey } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { SecureHeapUsage } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { X25519KeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { X25519KeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { X448KeyPairKeyObjectOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { X448KeyPairOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { X509Certificate } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { X509CheckOptions } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { checkPrimeSync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { createCipher } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { createDecipher } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { createDiffieHellman } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { createDiffieHellmanGroup } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { createECDH } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { diffieHellman } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { fips } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { generateKeyPairSync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { generateKeySync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { generatePrimeSync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getCipherInfo } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getCiphers } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getCurves } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getDiffieHellman } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getFips } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getHashes } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { getRandomValues } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { hash } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { hkdfSync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { pbkdf2Sync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { privateDecrypt } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { privateEncrypt } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { pseudoRandomBytes } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { publicDecrypt } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { publicEncrypt } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { randomFillSync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { randomInt } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { scryptSync } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { secureHeapUsed } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { setEngine } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { setFips } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { sign } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { timingSafeEqual } from '@cancjs/node/crypto';
// @ts-expect-error E6 removed named export
import type { verify } from '@cancjs/node/crypto';

void [
  Hash,
  Hmac,
  KeyObject,
  Sign,
  Verify,
  argon2,
  checkPrime,
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSecretKey,
  createSign,
  createVerify,
  decapsulate,
  encapsulate,
  generateKey,
  generateKeyPair,
  generatePrime,
  hkdf,
  pbkdf2,
  randomBytes,
  randomFill,
  randomUUID,
  scrypt,
  webcrypto,
];
