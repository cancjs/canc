import {
  ABORT_ERROR_BRAND,
  AbortError,
  AGGREGATE_ERROR_BRAND,
  CANCEL_ERROR_BRAND,
  compileErrorMatchers,
  isAbortError,
  isAggregateError,
  isCancelError,
  isSupersededError,
  isTimeoutError,
  SUPERSEDED_ERROR_BRAND,
  TIMEOUT_ERROR_BRAND,
  TimeoutError,
  toCancelError,
} from '../../_util';
import { CancelError } from './cancel-error';

describe('exception-safe brand and name reads on hostile reasons', () => {
  const createHostileProxy = (): object =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(`Hostile property access for ${String(prop)}`);
        },
      },
    );

  const createThrowingName = (): object => ({
    get name() {
      throw new Error('Hostile name getter');
    },
  });

  const createThrowingBrand = (brand: symbol): object => ({
    get [brand]() {
      throw new Error(`Hostile brand getter for ${String(brand)}`);
    },
  });

  const createHostileObject = (): object => {
    const obj: Record<string | symbol, unknown> = {
      get name() {
        throw new Error('Hostile name getter');
      },
    };
    for (const brand of [
      ABORT_ERROR_BRAND,
      TIMEOUT_ERROR_BRAND,
      SUPERSEDED_ERROR_BRAND,
      AGGREGATE_ERROR_BRAND,
      CANCEL_ERROR_BRAND,
    ]) {
      Object.defineProperty(obj, brand, {
        get() {
          throw new Error(`Hostile brand getter for ${String(brand)}`);
        },
        configurable: true,
        enumerable: true,
      });
    }
    return obj;
  };

  const guards = [
    { name: 'isAbortError', fn: isAbortError },
    { name: 'isTimeoutError', fn: isTimeoutError },
    { name: 'isSupersededError', fn: isSupersededError },
    { name: 'isAggregateError', fn: isAggregateError },
    { name: 'isCancelError', fn: isCancelError },
  ];

  const matchers = [
    {
      name: 'string AbortError',
      fn: compileErrorMatchers(['AbortError'], 'test'),
    },
    {
      name: 'string TimeoutError',
      fn: compileErrorMatchers(['TimeoutError'], 'test'),
    },
    {
      name: 'string foreign name',
      fn: compileErrorMatchers(['CustomError'], 'test'),
    },
    {
      name: 'constructor AbortError',
      fn: compileErrorMatchers([AbortError], 'test'),
    },
    {
      name: 'constructor TimeoutError',
      fn: compileErrorMatchers([TimeoutError], 'test'),
    },
    {
      name: 'constructor base Error',
      fn: compileErrorMatchers([Error], 'test'),
    },
    {
      name: 'multiple matchers',
      fn: compileErrorMatchers(['AbortError', TimeoutError, 'OtherError'], 'test'),
    },
  ];

  describe('Proxy whose every get throws', () => {
    const hostile = createHostileProxy();

    for (const { name, fn } of guards) {
      it(`${name} returns false without throwing`, () => {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      });
    }

    for (const { name, fn } of matchers) {
      it(`matcher ${name} returns false without throwing`, () => {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      });
    }

    it('toCancelError normalizes without throwing', () => {
      let result: any;
      expect(() => {
        result = toCancelError(hostile, CancelError);
      }).not.toThrow();
      expect(result).toBeInstanceOf(CancelError);
      expect(result.cause).toBe(hostile);
    });
  });

  describe('Proxy whose get, getPrototypeOf and has all throw', () => {
    const deepHostile = new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(`Hostile property access for ${String(prop)}`);
        },
        getPrototypeOf() {
          throw new Error('Hostile getPrototypeOf');
        },
        has(_target, prop) {
          throw new Error(`Hostile has for ${String(prop)}`);
        },
      },
    );

    for (const { name, fn } of guards) {
      it(`${name} returns false without throwing`, () => {
        expect(() => fn(deepHostile)).not.toThrow();
        expect(fn(deepHostile)).toBe(false);
      });
    }

    for (const { name, fn } of matchers) {
      it(`matcher ${name} returns false without throwing`, () => {
        expect(() => fn(deepHostile)).not.toThrow();
        expect(fn(deepHostile)).toBe(false);
      });
    }

    it('toCancelError normalizes without throwing', () => {
      let result: any;
      expect(() => {
        result = toCancelError(deepHostile, CancelError);
      }).not.toThrow();
      expect(result).toBeInstanceOf(CancelError);
      expect(result.cause).toBe(deepHostile);
    });
  });

  describe('object with throwing name getter', () => {
    const hostile = createThrowingName();

    for (const { name, fn } of guards) {
      it(`${name} returns false without throwing`, () => {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      });
    }

    for (const { name, fn } of matchers) {
      it(`matcher ${name} returns false without throwing`, () => {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      });
    }

    it('toCancelError normalizes without throwing', () => {
      let result: any;
      expect(() => {
        result = toCancelError(hostile, CancelError);
      }).not.toThrow();
      expect(result).toBeInstanceOf(CancelError);
      expect(result.cause).toBe(hostile);
    });
  });

  describe('throwing brand symbol getter', () => {
    const brands = [
      { name: 'ABORT_ERROR_BRAND', brand: ABORT_ERROR_BRAND },
      { name: 'TIMEOUT_ERROR_BRAND', brand: TIMEOUT_ERROR_BRAND },
      { name: 'SUPERSEDED_ERROR_BRAND', brand: SUPERSEDED_ERROR_BRAND },
      { name: 'AGGREGATE_ERROR_BRAND', brand: AGGREGATE_ERROR_BRAND },
      { name: 'CANCEL_ERROR_BRAND', brand: CANCEL_ERROR_BRAND },
    ];

    for (const { name: brandName, brand } of brands) {
      it(`guards return false without throwing on ${brandName}`, () => {
        const hostile = createThrowingBrand(brand);
        for (const { fn } of guards) {
          expect(() => fn(hostile)).not.toThrow();
          expect(fn(hostile)).toBe(false);
        }
      });
    }

    it('matchers return false without throwing on throwing brand', () => {
      const hostile = createThrowingBrand(ABORT_ERROR_BRAND);
      for (const { fn } of matchers) {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      }
    });
  });

  describe('object with throwing name and throwing brands', () => {
    const hostile = createHostileObject();

    for (const { name, fn } of guards) {
      it(`${name} returns false without throwing`, () => {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      });
    }

    for (const { name, fn } of matchers) {
      it(`matcher ${name} returns false without throwing`, () => {
        expect(() => fn(hostile)).not.toThrow();
        expect(fn(hostile)).toBe(false);
      });
    }
  });

  describe('constructor with throwing Symbol.hasInstance', () => {
    class ThrowingHasInstanceError extends Error {}
    Object.defineProperty(ThrowingHasInstanceError, Symbol.hasInstance, {
      value() {
        throw new Error('Hostile hasInstance');
      },
    });

    const matcher = compileErrorMatchers([ThrowingHasInstanceError], 'test');

    it('returns false without throwing on hostile proxy', () => {
      expect(() => matcher(createHostileProxy())).not.toThrow();
      expect(matcher(createHostileProxy())).toBe(false);
    });

    it('returns false without throwing on plain object', () => {
      expect(() => matcher({})).not.toThrow();
      expect(matcher({})).toBe(false);
    });
  });

  describe('constructor with undefined name', () => {
    class UnnamedError extends Error {
      constructor() {
        super();
        Object.setPrototypeOf(this, UnnamedError.prototype);
      }
    }
    Object.defineProperty(UnnamedError, 'name', { value: undefined });

    const matcher = compileErrorMatchers([UnnamedError], 'test');

    it('does not match plain object or object without name', () => {
      expect(matcher({})).toBe(false);
      expect(matcher({ name: 'other' })).toBe(false);
    });

    it('still matches real instances', () => {
      expect(matcher(new UnnamedError())).toBe(true);
    });
  });

  describe('constructor with throwing name getter', () => {
    const HostileNameCtor = function () {};
    Object.setPrototypeOf(HostileNameCtor.prototype, Error.prototype);
    Object.defineProperty(HostileNameCtor, 'name', {
      get() {
        throw new Error('Hostile constructor name getter');
      },
    });

    it('compiles without throwing and evaluates safely', () => {
      let matcher: any;
      expect(() => {
        matcher = compileErrorMatchers([HostileNameCtor as any], 'test');
      }).not.toThrow();
      expect(matcher({})).toBe(false);
      expect(matcher(createHostileProxy())).toBe(false);
    });
  });

  describe('function with throwing prototype getter', () => {
    const HostileProtoFn = new Proxy(
      function () {
        return false;
      },
      {
        get(target, prop) {
          if (prop === 'prototype') {
            throw new Error('Hostile prototype getter');
          }
          return (target as any)[prop];
        },
      },
    );

    it('compiles without throwing and evaluates safely as predicate', () => {
      let matcher: any;
      expect(() => {
        matcher = compileErrorMatchers([HostileProtoFn as any], 'test');
      }).not.toThrow();
      expect(matcher).toBe(HostileProtoFn);
      expect(matcher({})).toBe(false);
    });
  });

  describe('constructor with prototype having throwing ownKeys', () => {
    const HostileOwnKeysCtor = function () {
      return false;
    };
    HostileOwnKeysCtor.prototype = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('Hostile ownKeys on prototype');
        },
      },
    );

    it('compiles without throwing and evaluates safely', () => {
      let matcher: any;
      expect(() => {
        matcher = compileErrorMatchers([HostileOwnKeysCtor as any], 'test');
      }).not.toThrow();
      expect(matcher({})).toBe(false);
    });
  });

  describe('constructor with prototype having throwing getPrototypeOf', () => {
    const HostileGetProtoCtor = function () {
      return false;
    };
    HostileGetProtoCtor.prototype = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('Hostile getPrototypeOf on prototype');
        },
      },
    );

    it('compiles without throwing and evaluates safely', () => {
      let matcher: any;
      expect(() => {
        matcher = compileErrorMatchers([HostileGetProtoCtor as any], 'test');
      }).not.toThrow();
      expect(matcher({})).toBe(false);
    });
  });

  describe('genuine errors still match normally', () => {
    it('matches AbortError by guard and matcher', () => {
      const err = new AbortError('aborted');
      expect(isAbortError(err)).toBe(true);
      expect(isTimeoutError(err)).toBe(false);
      expect(compileErrorMatchers(['AbortError'], 'test')(err)).toBe(true);
      expect(compileErrorMatchers([AbortError], 'test')(err)).toBe(true);
    });

    it('matches TimeoutError by guard and matcher', () => {
      const err = new TimeoutError('timed out');
      expect(isTimeoutError(err)).toBe(true);
      expect(isAbortError(err)).toBe(false);
      expect(compileErrorMatchers(['TimeoutError'], 'test')(err)).toBe(true);
      expect(compileErrorMatchers([TimeoutError], 'test')(err)).toBe(true);
    });

    it('matches CancelError by guard', () => {
      const err = new CancelError('canceled');
      expect(isCancelError(err)).toBe(true);
      expect(isAbortError(err)).toBe(false);
      expect(isTimeoutError(err)).toBe(false);
    });

    it('does not match plain object named CancelError (brand only)', () => {
      expect(isCancelError({ name: 'CancelError' })).toBe(false);
    });
  });

  describe('user predicate error propagation and identity', () => {
    it('propagates throwing user predicate error when compiled as single matcher', () => {
      const boom = new Error('user predicate boom');
      const single = compileErrorMatchers(
        [
          () => {
            throw boom;
          },
        ],
        'test',
      );
      expect(() => single(new Error())).toThrow(boom);
    });

    it('propagates throwing user predicate error in multi-matcher loop', () => {
      const boom = new Error('user predicate boom');
      const multi = compileErrorMatchers(
        [
          'NonExistentName',
          () => {
            throw boom;
          },
        ],
        'test',
      );
      expect(() => multi(new Error())).toThrow(boom);
    });

    it('preserves single user predicate identity', () => {
      const predicate = (err: any) => err !== null;
      const compiled = compileErrorMatchers([predicate], 'test');
      expect(compiled).toBe(predicate);
    });
  });
});
