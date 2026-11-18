/**
 * `@cancjs/node` declarations against a real `@types/node`. Compiled only in the lanes of
 * matrix.config.json that pin `@types/node` (the floor major and `latest`), never in the default
 * TypeScript lanes, which pin one `@types/node` for every fixture.
 *
 * Importing every subpath makes tsc check each shipped declaration file with `skipLibCheck: false`,
 * so a name that some `@types/node` major no longer exports fails here instead of at a user.
 * The `generateKeyPair` block pins the resolved types, because the failure that motivated this
 * lane compiled silently under `skipLibCheck: true` and typed the result as strings.
 *
 * Deliberately runtime-dead: nothing executes.
 */
import type { KeyObject } from 'node:crypto';

import type {} from '@cancjs/node';
import type {} from '@cancjs/node/child-process';
import { generateKeyPair } from '@cancjs/node/crypto';
import type {} from '@cancjs/node/dgram';
import type {} from '@cancjs/node/dns';
import type {} from '@cancjs/node/events';
import type {} from '@cancjs/node/fs';
import type {} from '@cancjs/node/fs/extra';
import type {} from '@cancjs/node/fs/register-graceful';
import type {} from '@cancjs/node/fs/sync';
import type {} from '@cancjs/node/readline';
import type {} from '@cancjs/node/stream';
import type {} from '@cancjs/node/timers';
import type {} from '@cancjs/node/worker-threads';
import type {} from '@cancjs/node/zlib';

import type { Equal, Expect } from '../common/assert-type';

interface Pair<TPublic, TPrivate> {
  publicKey: TPublic;
  privateKey: TPrivate;
}

export async function keyPairTypes(): Promise<void> {
  const pemPub = { type: 'spki', format: 'pem' } as const;
  const derPub = { type: 'spki', format: 'der' } as const;
  const pemPriv = { type: 'pkcs8', format: 'pem' } as const;
  const derPriv = { type: 'pkcs8', format: 'der' } as const;

  const rsaKeys = await generateKeyPair('rsa', { modulusLength: 2048 });
  const rsaPemPem = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: pemPub,
    privateKeyEncoding: pemPriv,
  });
  const rsaDerPem = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: derPub,
    privateKeyEncoding: pemPriv,
  });
  const rsaPemDer = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: pemPub,
    privateKeyEncoding: derPriv,
  });
  const rsaDerDer = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: derPub,
    privateKeyEncoding: derPriv,
  });
  const rsaPssKeys = await generateKeyPair('rsa-pss', { modulusLength: 2048, saltLength: 32 });
  const dsaKeys = await generateKeyPair('dsa', { modulusLength: 2048, divisorLength: 256 });
  const ecKeys = await generateKeyPair('ec', { namedCurve: 'P-256' });
  const ecPemPem = await generateKeyPair('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: pemPub,
    privateKeyEncoding: { type: 'sec1', format: 'pem' },
  });
  const ed25519Keys = await generateKeyPair('ed25519');
  const ed25519Empty = await generateKeyPair('ed25519', {});
  const ed448Keys = await generateKeyPair('ed448');
  const ed25519PemPem = await generateKeyPair('ed25519', { publicKeyEncoding: pemPub, privateKeyEncoding: pemPriv });
  const x25519Keys = await generateKeyPair('x25519');
  const x448DerDer = await generateKeyPair('x448', { publicKeyEncoding: derPub, privateKeyEncoding: derPriv });

  type TChecks = [
    Expect<Equal<typeof rsaKeys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof rsaPemPem, Pair<string, string>>>,
    Expect<Equal<typeof rsaDerPem, Pair<Buffer, string>>>,
    Expect<Equal<typeof rsaPemDer, Pair<string, Buffer>>>,
    Expect<Equal<typeof rsaDerDer, Pair<Buffer, Buffer>>>,
    Expect<Equal<typeof rsaPssKeys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof dsaKeys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof ecKeys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof ecPemPem, Pair<string, string>>>,
    Expect<Equal<typeof ed25519Keys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof ed25519Empty, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof ed448Keys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof ed25519PemPem, Pair<string, string>>>,
    Expect<Equal<typeof x25519Keys, Pair<KeyObject, KeyObject>>>,
    Expect<Equal<typeof x448DerDer, Pair<Buffer, Buffer>>>,
  ];
  const checks: TChecks | undefined = undefined;
  void checks;

  // @ts-expect-error saltLength is a number at runtime
  void generateKeyPair('rsa-pss', { modulusLength: 2048, saltLength: '32' });
  // @ts-expect-error an rsa key needs modulusLength
  void generateKeyPair('rsa', {});
  // @ts-expect-error unknown key type
  void generateKeyPair('not-a-key-type', {});
}
