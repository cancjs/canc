import { async as cancAsync } from '@cancjs/coroutine';
import { cancelify, createSuppressError as toolboxCreateSuppressError, promisify } from '@cancjs/toolbox';
import { createSuppressError as nativeCreateSuppressError } from '@cancjs/toolbox-native';
import * as fs from 'fs';
import * as path from 'path';

import {
  _AbortError as AbortError,
  _createSuppressError as createSuppressError,
  _isAbortError as isAbortError,
  _isTimeoutError as isTimeoutError,
  _TimeoutError as TimeoutError,
  AggregateError,
  CANCEL_SIGNAL_BRAND,
  CancelablePromise,
  CancelError,
  createCancelSignal,
  isAggregateError,
  isCancelError,
  suppressCancel,
} from './index';

// Cross-package smoke for the phase that unified error classes/brands, added the matcher
// factories, and gave every wrapper a displayName. Each unit is already covered in its own
// package's suite (see cancel-error.spec.ts, error-brands.spec.ts, error-matchers.spec.ts,
// coroutine.spec.ts, cancelify.spec.ts, promisify.spec.ts, suppress.spec.ts); this file's job is
// to prove those pieces still cohere when consumed the way a real dependent package would: through
// the published package name, not a relative source path.

// Same reflection approach `_util/error-matchers.ts` uses to find a class's registry brand: a
// registry symbol is any own symbol whose `Symbol.keyFor` resolves, i.e. it round-trips through
// `Symbol.for`.
const findBrand = (obj: object): symbol | undefined =>
  Object.getOwnPropertySymbols(obj).find((s) => Symbol.keyFor(s) !== undefined);

describe('smoke 1: brand-scheme invariants, consumed via the package name', () => {
  const KEY_PATTERN = /^@cancjs\/[a-z-]+:[A-Z][A-Za-z]*$/;

  const cancelErrorBrand = findBrand(CancelError.prototype);
  const abortErrorBrand = findBrand(AbortError.prototype);
  const timeoutErrorBrand = findBrand(TimeoutError.prototype);

  const platformAggregateError = (globalThis as { AggregateError?: unknown }).AggregateError;
  const aggregateIsPlatformBacked =
    typeof platformAggregateError === 'function' && AggregateError === platformAggregateError;
  const aggregateErrorBrand = aggregateIsPlatformBacked ? undefined : findBrand(AggregateError.prototype);

  it('CancelError, AbortError, TimeoutError, AggregateError (unless platform-backed) each carry exactly one registry brand on the prototype', () => {
    expect(cancelErrorBrand).toBeDefined();
    expect(abortErrorBrand).toBeDefined();
    expect(timeoutErrorBrand).toBeDefined();

    if (!aggregateIsPlatformBacked) {
      expect(aggregateErrorBrand).toBeDefined();
    }
  });

  it('every discovered key is the documented literal', () => {
    expect(Symbol.keyFor(cancelErrorBrand!)).toBe('@cancjs/promise:CancelError');
    expect(Symbol.keyFor(abortErrorBrand!)).toBe('@cancjs/promise:AbortError');
    expect(Symbol.keyFor(timeoutErrorBrand!)).toBe('@cancjs/promise:TimeoutError');

    if (!aggregateIsPlatformBacked) {
      expect(Symbol.keyFor(aggregateErrorBrand!)).toBe('@cancjs/promise:AggregateError');
    }
  });

  it('every discovered key matches the PascalCase, no-space naming pattern', () => {
    const keys = [
      cancelErrorBrand,
      abortErrorBrand,
      timeoutErrorBrand,
      ...(aggregateIsPlatformBacked ? [] : [aggregateErrorBrand]),
    ].map((brand) => Symbol.keyFor(brand!));

    keys.forEach((key) => expect(key).toMatch(KEY_PATTERN));
  });

  it('brands live on the prototype: a fresh instance carries none of its own', () => {
    expect(Object.getOwnPropertySymbols(new CancelError())).toHaveLength(0);
    expect(Object.getOwnPropertySymbols(new AbortError())).toHaveLength(0);
    expect(Object.getOwnPropertySymbols(new TimeoutError())).toHaveLength(0);
  });

  // Documented exception, not a bug: CancelSignal brands the AbortSignal instance directly, since
  // there is no subclassable AbortSignal prototype to mutate. Included so this smoke's "five
  // brands" line does not silently drop the one shaped differently from the rest.
  it('CancelSignal is the documented exception: instance-branded, registry key still correct', () => {
    const { signal } = createCancelSignal();
    const plainSignal = new AbortController().signal;

    expect(Symbol.keyFor(CANCEL_SIGNAL_BRAND)).toBe('@cancjs/promise:CancelSignal');
    expect(Object.getOwnPropertySymbols(signal)).toContain(CANCEL_SIGNAL_BRAND);
    expect(Object.getOwnPropertySymbols(plainSignal)).not.toContain(CANCEL_SIGNAL_BRAND);
  });
});

describe('smoke 2: guard cross-matching is negative across package-name imports', () => {
  const GUARDS: Array<{ name: string; guard: (value: any) => boolean }> = [
    { name: 'isCancelError', guard: isCancelError },
    { name: 'isAbortError', guard: isAbortError },
    { name: 'isTimeoutError', guard: isTimeoutError },
    { name: 'isAggregateError', guard: isAggregateError },
  ];

  const ROWS: Array<{ name: string; ownGuard: string; makeInstance: () => unknown }> = [
    { name: 'CancelError', ownGuard: 'isCancelError', makeInstance: () => new CancelError() },
    { name: 'AbortError', ownGuard: 'isAbortError', makeInstance: () => new AbortError() },
    { name: 'TimeoutError', ownGuard: 'isTimeoutError', makeInstance: () => new TimeoutError() },
  ];

  it.each(ROWS)('$name is matched by exactly one guard, its own', ({ ownGuard, makeInstance }) => {
    const instance = makeInstance();
    const matched = GUARDS.filter(({ guard }) => guard(instance)).map(({ name }) => name);

    expect(matched).toEqual([ownGuard]);
  });
});

describe('smoke 2b: timedOut end-to-end through a real AbortSignal.timeout', () => {
  it('a CancelablePromise built with { signal: AbortSignal.timeout(10) } rejects with a CancelError whose timedOut is true, and suppressCancel({ timeout: true }) swallows it', async () => {
    if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
      return;
    }

    const rejected = new CancelablePromise<void>(() => {}, { signal: AbortSignal.timeout(10) });

    await expect(rejected).rejects.toBeInstanceOf(CancelError);

    let caught: unknown;
    try {
      await rejected;
    } catch (error) {
      caught = error;
    }

    expect((caught as CancelError).timedOut).toBe(true);
    expect((caught as CancelError).aborted).toBe(false);

    const swallowed = new CancelablePromise<void>(() => {}, { signal: AbortSignal.timeout(10) });

    await expect(suppressCancel(swallowed, { timeout: true })).resolves.toBeUndefined();
  });
});

describe('smoke 3: matcher factories swallow every listed kind and rethrow the rest', () => {
  it('createSuppressError(CancelError, TimeoutError) swallows both and rethrows a plain Error', () => {
    const suppress = createSuppressError(CancelError, TimeoutError);

    expect(suppress(new CancelError())).toBeUndefined();
    expect(suppress(new TimeoutError())).toBeUndefined();
    expect(() => suppress(new Error('nope'))).toThrow(Error);
  });

  it('the same factory re-exported from @cancjs/toolbox is the identical product shape', () => {
    const suppress = toolboxCreateSuppressError(CancelError, TimeoutError);

    expect(suppress(new CancelError())).toBeUndefined();
    expect(suppress(new TimeoutError())).toBeUndefined();
    expect(() => suppress(new AbortError())).toThrow(AbortError);
  });
});

describe('smoke 4: every wrapper produces a "kind: name" displayName', () => {
  // `displayName` is not part of any of these wrappers' declared return TYPE (matches the
  // convention every wrapper-naming spec already uses, e.g. coroutine.spec.ts / cancelify.spec.ts /
  // promisify.spec.ts), so the read is cast the same way those specs do. `cancGenAsync` is
  // exercised the same way already, in its own package's coroutine-gen.spec.ts: its public entry
  // point is the `@cancjs/coroutine/gen` subpath, which is not in this monorepo's dev tsconfig
  // "paths" map for cross-package type-checking, so it is not repeated here.
  it('cancAsync', () => {
    expect((cancAsync(function* load() {}) as any).displayName).toBe('coroutine: load');
  });

  it('cancelify', () => {
    expect((cancelify(function loadUser() {}) as any).displayName).toBe('cancelify: loadUser');
  });

  it('promisify', () => {
    expect((promisify(function readFile() {}) as any).displayName).toBe('promisify: readFile');
  });
});

describe('smoke 5: suppress/catch on the native toolbox twin', () => {
  const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

  function cancelErrorLike(): Error {
    const error = new Error('canceled');
    Object.defineProperty(error, CANCEL_ERROR_BRAND, { value: true });
    return error;
  }

  it('swallows a CancelError-shaped rejection and resolves undefined', async () => {
    await expect(nativeCreateSuppressError(CancelError)(Promise.reject(cancelErrorLike()))).resolves.toBeUndefined();
  });

  it('the returned promise carries no `cancel` (a native promise has nothing to propagate to)', async () => {
    const result = nativeCreateSuppressError(CancelError)(Promise.reject(cancelErrorLike()));

    expect((result as unknown as { cancel?: unknown }).cancel).toBeUndefined();
    await result;
  });
});

describe('smoke 6: the shared error module is the single home, repo-wide', () => {
  const PACKAGES_ROOT = path.resolve(__dirname, '../../../packages');
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

  function collectTsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('~~') || entry.name.endsWith('~~') || SKIP_DIRS.has(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        collectTsFiles(full, out);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        out.push(full);
      }
    }

    return out;
  }

  const files = collectTsFiles(PACKAGES_ROOT);
  const classDeclPattern = /\bclass\s+(AbortError|TimeoutError)\b/;

  it('no package declares its own AbortError/TimeoutError class outside _util/errors.ts', () => {
    const offenders = files.filter((file) => {
      if (path.resolve(file) === path.resolve(PACKAGES_ROOT, '_util/errors.ts')) return false;
      const source = fs.readFileSync(file, 'utf8');
      return classDeclPattern.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it('the old spaced CancelSignal brand key is gone repo-wide', () => {
    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes('@cancjs/promise:cancel signal'));

    expect(offenders).toEqual([]);
  });

  it('no wrapper still uses the old space-separated displayName form', () => {
    const offenders = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes("displayName = 'coroutine ") || source.includes("displayName += ' '");
    });

    expect(offenders).toEqual([]);
  });
});
