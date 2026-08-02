import { BreakError, isBreakError } from '@cancjs/coroutine';

import {
  ABORT_ERROR_BRAND,
  AbortError,
  AGGREGATE_ERROR_BRAND,
  AggregateError,
  createAggregateError,
  isAbortError,
  isAggregateError,
  isTimeoutError,
  TIMEOUT_ERROR_BRAND,
  TimeoutError,
} from '../../_util';
import { CANCEL_ERROR_BRAND, CancelError } from './cancel-error';
import { CANCEL_PROMISE_BRAND, CancelablePromise } from './cancelable-promise';
import { CANCEL_SIGNAL_BRAND, createCancelSignal, isCancelError, isCancelSignal, isCancPromise } from './helpers';

// This suite tests the BRAND SCHEME as a whole, not any one class's behavior (each class already
// has its own unit tests). Every property here holds across all seven brands the scheme currently
// carries: CancelError and CancelablePromise (canc-promise), CancelSignal (canc-promise, an
// exception described below), AbortError/TimeoutError/AggregateError (shared, described in
// _util/errors.ts), and BreakError (canc-coroutine). BreakError is imported directly rather than
// mirrored: canc-coroutine only appears in this package's devDependencies through the workspace,
// never in canc-promise's own package.json, and jest resolves it straight to source via the
// monorepo's module mapping, so no build-order edge is created.

interface IBrandKeyEntry {
  name: string;
  brand: symbol;
  key: string;
}

const BRAND_KEYS: IBrandKeyEntry[] = [
  { name: 'CancelError', brand: CANCEL_ERROR_BRAND, key: '@cancjs/promise:CancelError' },
  { name: 'CancelablePromise', brand: CANCEL_PROMISE_BRAND, key: '@cancjs/promise:CancelablePromise' },
  { name: 'CancelSignal', brand: CANCEL_SIGNAL_BRAND, key: '@cancjs/promise:CancelSignal' },
  { name: 'AbortError', brand: ABORT_ERROR_BRAND, key: '@cancjs/promise:AbortError' },
  { name: 'TimeoutError', brand: TIMEOUT_ERROR_BRAND, key: '@cancjs/promise:TimeoutError' },
  { name: 'AggregateError', brand: AGGREGATE_ERROR_BRAND, key: '@cancjs/promise:AggregateError' },
  // BREAK_ERROR_BRAND is not exported from canc-coroutine; Symbol.for is registry-global, so
  // requesting the same string here returns the identical symbol without needing the private
  // binding.
  { name: 'BreakError', brand: Symbol.for('@cancjs/coroutine:BreakError'), key: '@cancjs/coroutine:BreakError' },
];

describe('brand scheme: registry symbols', () => {
  it.each(BRAND_KEYS)('$name carries the documented literal key', ({ brand, key }) => {
    expect(Symbol.keyFor(brand)).toBe(key);
  });
});

describe('brand scheme: key format', () => {
  // The identifier segment is PascalCase: it must start with an uppercase letter. A pattern that
  // merely allowed [A-Za-z]+ would accept an all-lowercase or camelCase segment too, defeating the
  // "no lowercase-only identifiers" property this test exists to pin.
  const KEY_PATTERN = /^@cancjs\/[a-z-]+:[A-Z][A-Za-z]*$/;

  it.each(BRAND_KEYS)('$name key matches the naming pattern', ({ key }) => {
    expect(key).toMatch(KEY_PATTERN);
  });

  // The pattern is only useful if it actually rejects what the scheme moved away from: a spaced,
  // lowercase-only identifier segment.
  it('rejects a spaced identifier segment', () => {
    expect('@cancjs/promise:cancel signal').not.toMatch(KEY_PATTERN);
  });

  it('rejects a lowercase-only identifier segment', () => {
    expect('@cancjs/promise:cancelSignal').not.toMatch(KEY_PATTERN);
    expect('@cancjs/promise:cancelsignal').not.toMatch(KEY_PATTERN);
  });
});

interface IPrototypeBrandEntry {
  name: string;
  brand: symbol;
  prototype: object;
  makeInstance: () => unknown;
}

const PROTOTYPE_BRAND_ENTRIES: IPrototypeBrandEntry[] = [
  {
    name: 'CancelError',
    brand: CANCEL_ERROR_BRAND,
    prototype: CancelError.prototype,
    makeInstance: () => new CancelError(),
  },
  {
    name: 'CancelablePromise',
    brand: CANCEL_PROMISE_BRAND,
    prototype: CancelablePromise.prototype,
    makeInstance: () => CancelablePromise.resolve(1),
  },
  {
    name: 'AbortError',
    brand: ABORT_ERROR_BRAND,
    prototype: AbortError.prototype,
    makeInstance: () => new AbortError(),
  },
  {
    name: 'TimeoutError',
    brand: TIMEOUT_ERROR_BRAND,
    prototype: TimeoutError.prototype,
    makeInstance: () => new TimeoutError(),
  },
  {
    name: 'BreakError',
    brand: Symbol.for('@cancjs/coroutine:BreakError'),
    prototype: BreakError.prototype,
    makeInstance: () => new BreakError(),
  },
];

describe('brand scheme: brands live on the prototype, not the instance', () => {
  it.each(PROTOTYPE_BRAND_ENTRIES)('$name', ({ brand, prototype, makeInstance }) => {
    const instance = makeInstance() as object;

    expect(Object.getOwnPropertySymbols(instance)).not.toContain(brand);
    expect(Object.getOwnPropertySymbols(prototype)).toContain(brand);
    expect((prototype as Record<symbol, unknown>)[brand]).toBe(true);
  });

  // CancelSignal is the documented exception: it brands a native AbortSignal instance directly
  // (helpers.ts has no subclassable AbortSignal prototype to mutate, so createCancelSignal sets
  // the brand as an own property on each signal it mints instead).
  it('CancelSignal brands the instance directly, not a shared prototype', () => {
    const { signal } = createCancelSignal();
    const plainSignal = new AbortController().signal;

    expect(Object.getOwnPropertySymbols(signal)).toContain(CANCEL_SIGNAL_BRAND);
    expect((signal as unknown as Record<symbol, unknown>)[CANCEL_SIGNAL_BRAND]).toBe(true);
    expect(Object.getOwnPropertySymbols(plainSignal)).not.toContain(CANCEL_SIGNAL_BRAND);
  });

  // AggregateError is the other documented exception: only the shim's prototype is branded, a
  // present platform class is left unmutated and recognized by name instead (see _util/errors.ts).
  it('AggregateError only brands the shim; a present platform class stays unmutated', () => {
    const platformAggregateError = (globalThis as { AggregateError?: unknown }).AggregateError;
    const isPlatformBacked = typeof platformAggregateError === 'function' && AggregateError === platformAggregateError;

    if (isPlatformBacked) {
      expect(Object.getOwnPropertySymbols(AggregateError.prototype)).not.toContain(AGGREGATE_ERROR_BRAND);
    } else {
      expect(Object.getOwnPropertySymbols(AggregateError.prototype)).toContain(AGGREGATE_ERROR_BRAND);
    }

    expect(Object.getOwnPropertySymbols(createAggregateError([]))).not.toContain(AGGREGATE_ERROR_BRAND);
  });
});

describe('brand scheme: brands are non-enumerable', () => {
  it.each(PROTOTYPE_BRAND_ENTRIES)('$name prototype descriptor', ({ brand, prototype }) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, brand);

    expect(descriptor).toBeDefined();
    expect(descriptor!.enumerable).toBe(false);
  });

  it.each(PROTOTYPE_BRAND_ENTRIES)('$name instance serializes with no trace of the brand', ({ makeInstance }) => {
    const instance = makeInstance();
    const serialized = JSON.parse(JSON.stringify(instance)) as object;

    expect(Object.getOwnPropertySymbols(serialized)).toHaveLength(0);
    expect(Object.keys(instance as object).every((key) => typeof key === 'string')).toBe(true);
  });

  it('CancelSignal own-property brand is non-enumerable', () => {
    const { signal } = createCancelSignal();
    const descriptor = Object.getOwnPropertyDescriptor(signal, CANCEL_SIGNAL_BRAND);

    expect(descriptor).toBeDefined();
    expect(descriptor!.enumerable).toBe(false);
  });
});

interface ICrossCopyEntry {
  name: string;
  brand: symbol;
  guard: (value: any) => boolean;
  ctor?: new (...args: any[]) => unknown;
}

const CROSS_COPY_ENTRIES: ICrossCopyEntry[] = [
  { name: 'CancelError', brand: CANCEL_ERROR_BRAND, guard: isCancelError, ctor: CancelError },
  { name: 'CancelablePromise', brand: CANCEL_PROMISE_BRAND, guard: isCancPromise, ctor: CancelablePromise },
  { name: 'CancelSignal', brand: CANCEL_SIGNAL_BRAND, guard: isCancelSignal },
  { name: 'AbortError', brand: ABORT_ERROR_BRAND, guard: isAbortError, ctor: AbortError },
  { name: 'TimeoutError', brand: TIMEOUT_ERROR_BRAND, guard: isTimeoutError, ctor: TimeoutError },
  { name: 'AggregateError', brand: AGGREGATE_ERROR_BRAND, guard: isAggregateError, ctor: AggregateError },
  { name: 'BreakError', brand: Symbol.for('@cancjs/coroutine:BreakError'), guard: isBreakError, ctor: BreakError },
];

describe('brand scheme: a hand-built cross-copy object is matched by the brand alone', () => {
  // Simulates a second, unrelated copy of the package (the dual-package hazard the brands exist
  // for): an object built with Object.create(null), sharing no prototype and no constructor with
  // the real class, carrying only the registry symbol.
  it.each(CROSS_COPY_ENTRIES)('$name', ({ brand, guard, ctor }) => {
    const other = Object.create(null) as Record<symbol, unknown>;
    other[brand] = true;

    expect(guard(other)).toBe(true);

    if (ctor) {
      expect(other instanceof ctor).toBe(false);
    }
  });
});

describe('brand scheme: name fallback exists only where the platform produces the value', () => {
  it('isAbortError matches a plain object named AbortError', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
  });

  it('isTimeoutError matches a plain object named TimeoutError', () => {
    expect(isTimeoutError({ name: 'TimeoutError' })).toBe(true);
  });

  it('isTimeoutError matches a real platform AbortSignal.timeout rejection', async () => {
    if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
      return;
    }

    const signal = AbortSignal.timeout(0);

    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });

    expect(isTimeoutError(signal.reason)).toBe(true);
  });

  // The negative half pins the rule: CancelError and BreakError have no platform-produced
  // equivalent, so their guards stay brand-only. A name match alone must not pass.
  it('isCancelError does not match a plain object named CancelError', () => {
    expect(isCancelError({ name: 'CancelError' })).toBe(false);
  });

  it('isBreakError does not match a plain object named BreakError', () => {
    expect(isBreakError({ name: 'BreakError' })).toBe(false);
  });
});

describe('brand scheme: cross matching is negative', () => {
  const GUARDS: Array<{ name: string; guard: (value: any) => boolean }> = [
    { name: 'isCancelError', guard: isCancelError },
    { name: 'isCancPromise', guard: isCancPromise },
    { name: 'isCancelSignal', guard: isCancelSignal },
    { name: 'isAbortError', guard: isAbortError },
    { name: 'isTimeoutError', guard: isTimeoutError },
    { name: 'isAggregateError', guard: isAggregateError },
    { name: 'isBreakError', guard: isBreakError },
  ];

  const ROWS: Array<{ name: string; ownGuard: string; makeInstance: () => unknown }> = [
    { name: 'CancelError', ownGuard: 'isCancelError', makeInstance: () => new CancelError() },
    { name: 'CancelablePromise', ownGuard: 'isCancPromise', makeInstance: () => CancelablePromise.resolve(1) },
    { name: 'CancelSignal', ownGuard: 'isCancelSignal', makeInstance: () => createCancelSignal().signal },
    { name: 'AbortError', ownGuard: 'isAbortError', makeInstance: () => new AbortError() },
    { name: 'TimeoutError', ownGuard: 'isTimeoutError', makeInstance: () => new TimeoutError() },
    { name: 'AggregateError', ownGuard: 'isAggregateError', makeInstance: () => createAggregateError([]) },
    { name: 'BreakError', ownGuard: 'isBreakError', makeInstance: () => new BreakError() },
  ];

  it.each(ROWS)('$name is matched by exactly one guard, its own', ({ ownGuard, makeInstance }) => {
    const instance = makeInstance();
    const matchedNames = GUARDS.filter(({ guard }) => guard(instance)).map(({ name }) => name);

    expect(matchedNames).toEqual([ownGuard]);
  });
});

describe('brand scheme: a subclass with a rewritten name still matches by brand', () => {
  it('CancelError', () => {
    class Weird extends CancelError {
      constructor() {
        super();
        this.name = 'Nope';
      }
    }

    expect(isCancelError(new Weird())).toBe(true);
  });

  it('AbortError', () => {
    class Weird extends AbortError {
      constructor() {
        super();
        // Plain assignment throws here on a DOMException-backed instance: `name` is an inherited
        // getter-only accessor with no setter. defineProperty shadows it with an own data property,
        // which is the correct way to rename an instance of this kind regardless of which base the
        // platform picked.
        Object.defineProperty(this, 'name', { value: 'Nope', configurable: true, writable: true });
      }
    }

    expect(isAbortError(new Weird())).toBe(true);
  });

  it('TimeoutError', () => {
    class Weird extends TimeoutError {
      constructor() {
        super();
        Object.defineProperty(this, 'name', { value: 'Nope', configurable: true, writable: true });
      }
    }

    expect(isTimeoutError(new Weird())).toBe(true);
  });

  it('BreakError', () => {
    class Weird extends BreakError {
      constructor() {
        super();
        this.name = 'Nope';
      }
    }

    expect(isBreakError(new Weird())).toBe(true);
  });
});
