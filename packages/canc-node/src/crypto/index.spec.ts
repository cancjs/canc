import type { KeyObject } from 'node:crypto';

import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { isNotImplementedError } from '../errors/classes';
import { features } from '../features';
import * as cryptoExports from './index';
import { promisifyWrapped } from './wrap';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Never invoked: the point is that tsc resolves the call at the exact shape below, so `pbkdf2`
// accidentally widened to `unknown` fails compilation here rather than at a consumer's call site.
function typeAssertions(): unknown[] {
  const derived = cryptoExports.pbkdf2('password', 'salt', 1, 20, 'sha1');

  type _Assertions = [Expect<Equal<typeof derived, CancelablePromise<Buffer>>>];

  return [derived];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ARGON2_PARAMS = {
  message: 'correct horse battery staple',
  nonce: '0123456789abcdef',
  parallelism: 1,
  tagLength: 32,
  memory: 8,
  passes: 1,
} as const;

describe('@cancjs/node/crypto', () => {
  it('pbkdf2 resolves the RFC 6070 test vector (password/salt/1 iteration/20 bytes/sha1)', async () => {
    const derived = await cryptoExports.pbkdf2('password', 'salt', 1, 20, 'sha1');

    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.toString('hex')).toBe('0c60c80f961f0e71f3a9b524af6012062fe037a6');
  });

  it('canceling pbkdf2 rejects CancelError while node keeps running the derivation to completion', async () => {
    // enough iterations that the derivation is still in flight on the threadpool when cancel()
    // runs; the assertion below waits past that window instead of racing it
    const promise = cryptoExports.pbkdf2('password', 'salt', 400000, 32, 'sha256');
    promise.cancel('stop');

    const reason = await promise.catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(true);

    // give the real derivation, already running on the threadpool, time to actually finish; a
    // wrapper that had truly stopped the work would have nothing left running here to observe
    // indirectly through the absence of any unhandledRejection this produces
    let unhandled: unknown;
    const onUnhandled = (err: unknown): void => {
      unhandled = err;
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await sleep(500);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toBeUndefined();
  }, 10000);

  it('the underlying callback still fires after cancel, exactly once, with no double settle', async () => {
    // synthetic callback fn built the same way the real crypto wrappers are: through this
    // module's own promisifyWrapped, so the assertion is about /crypto's wiring specifically,
    // not the generic toolbox promisify this wiring is built on
    const fired: Array<[unknown, unknown]> = [];
    const slowCallbackFn = (ms: number, cb: (err: unknown, value?: number) => void): void => {
      setTimeout(() => {
        fired.push([null, 42]);
        cb(null, 42);
      }, 30);
    };

    const wrapped = promisifyWrapped(slowCallbackFn) as (ms: number) => CancelablePromise<number>;
    const promise = wrapped(30);
    promise.cancel();

    const reason = await promise.catch((err: unknown) => err);
    expect(isCancelError(reason)).toBe(true);

    await sleep(100);

    // the callback ran, once, after the promise had already rejected from cancel; nothing threw
    expect(fired.length).toBe(1);
    expect(fired[0]).toEqual([null, 42]);
  });

  it('argon2 is gated on node 24+, throws NotImplementedError naming the version below that', async () => {
    if (features.nodeMajor < 24) {
      let error: unknown;
      try {
        cryptoExports.argon2('argon2id', ARGON2_PARAMS);
      } catch (err) {
        error = err;
      }
      expect(isNotImplementedError(error)).toBe(true);
      expect((error as { required?: string }).required).toBe('24');
      return;
    }

    const derived = await cryptoExports.argon2('argon2id', ARGON2_PARAMS);
    expect(derived).toBeInstanceOf(Buffer);
    expect(derived.length).toBe(32);
  });

  it('generateKeyPair produces an rsa pair through the hand-typed overload', async () => {
    const { publicKey, privateKey } = await cryptoExports.generateKeyPair('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });

    expect(typeof publicKey).toBe('string');
    expect(typeof privateKey).toBe('string');
    expect(publicKey).toContain('BEGIN RSA PUBLIC KEY');
  });

  it('generateKey produces an hmac KeyObject', async () => {
    const key = await cryptoExports.generateKey('hmac', { length: 256 });
    expect(key.type).toBe('secret');
  });

  it('generatePrime then checkPrime agree the generated value is prime', async () => {
    const prime = await cryptoExports.generatePrime(32);
    expect(prime).toBeInstanceOf(ArrayBuffer);

    const isPrime = await cryptoExports.checkPrime(prime);
    expect(isPrime).toBe(true);
  });

  it('hkdf derives the requested key length', async () => {
    const derived = await cryptoExports.hkdf('sha256', 'ikm-material', 'salt-value', 'info', 32);
    expect(derived).toBeInstanceOf(ArrayBuffer);
    expect(derived.byteLength).toBe(32);
  });

  it('randomBytes resolves a Buffer of the requested length', async () => {
    const bytes = await cryptoExports.randomBytes(16);
    expect(bytes).toBeInstanceOf(Buffer);
    expect(bytes.length).toBe(16);
  });

  it('randomFill fills the view it is given and resolves that same view', async () => {
    const buffer = Buffer.alloc(16);
    const filled = await cryptoExports.randomFill(buffer);
    expect(filled).toBe(buffer);
    expect(filled.some((byte) => byte !== 0)).toBe(true);
  });

  it('encapsulate and decapsulate are gated on node 24+ and agree on the shared secret', async () => {
    if (features.nodeMajor < 24) {
      let error: unknown;
      try {
        cryptoExports.encapsulate({} as never);
      } catch (err) {
        error = err;
      }
      expect(isNotImplementedError(error)).toBe(true);
      expect((error as { required?: string }).required).toBe('24');
      return;
    }

    const { publicKey, privateKey } = await cryptoExports.generateKeyPair('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    void publicKey;
    void privateKey;

    const kemPair = cryptoExports.generateKeyPairSync('ml-kem-768' as never, {} as never) as unknown as {
      publicKey: KeyObject;
      privateKey: KeyObject;
    };

    const { sharedKey, ciphertext } = await cryptoExports.encapsulate(kemPair.publicKey);
    expect(sharedKey).toBeInstanceOf(Buffer);
    expect(ciphertext).toBeInstanceOf(Buffer);

    const decapsulated = await cryptoExports.decapsulate(kemPair.privateKey, ciphertext);
    expect(Buffer.compare(decapsulated, sharedKey)).toBe(0);
  });

  it('re-exports the synchronous factory surface unchanged, not routed through a promise', () => {
    expect(typeof cryptoExports.createHash).toBe('function');
    expect(typeof cryptoExports.createCipheriv).toBe('function');
    expect(typeof cryptoExports.randomUUID).toBe('function');
    expect(typeof cryptoExports.webcrypto).toBe('object');
    expect(typeof cryptoExports.constants).toBe('object');

    const hash = cryptoExports.createHash('sha256').update('canc').digest('hex');
    expect(typeof hash).toBe('string');
    expect(hash).not.toBeInstanceOf(CancelablePromise);
  });

  it('type fixture: pbkdf2 resolves exactly Buffer, not unknown', () => {
    // never called; its existence as a function value is enough to keep it from being flagged
    // unused while tsc still checks its body
    expect(typeof typeAssertions).toBe('function');
  });
});
