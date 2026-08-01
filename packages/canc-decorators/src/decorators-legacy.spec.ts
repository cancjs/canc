import 'reflect-metadata';

import { async as cancAsync } from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';

import { TAnyFn } from '../../_util';
import { AsyncMethod } from './decorators';
import { BabelLegacyAsyncMethod } from './decorators-babel-legacy';
import { LegacyAsyncMethod, LegacyBindMethod } from './decorators-legacy';

/**
 * TS legacy decorators matrix (`experimentalDecorators: true`).
 *
 * Same matrix as ES stage-3: 3 decorator types × 3 member types × 2 instance isolation +
 * GC assertion.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function gc() {
  if (global.gc) {
    global.gc();
  }
}

// FinalizationRegistry callbacks are best-effort: one collection is rarely enough to run them.
// Drive several GC cycles across macrotask turns until the predicate holds or the cap is reached.
async function forceCollect(done: () => boolean, cycles = 25, gap = 20): Promise<void> {
  for (let i = 0; i < cycles && !done(); i++) {
    gc();
    await delay(gap);
  }
}

// Access a property for its side effect (materializing a per-instance own-bound method) without
// retaining the result. A plain `const x = inst.method` is downleveled to a function-scoped `var`
// under the es5 target and would pin the instance for the whole test, defeating the GC assertion.
function touch(_value: unknown): void {
  // intentionally empty
}

describe('decorators (TS legacy) — LegacyAsyncMethod', () => {
  describe('bind:false (default)', () => {
    it('proto method wraps at decoration time', async () => {
      class C {
        @LegacyAsyncMethod()
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(42);
        }
      }

      const inst = new C();
      const result = await inst.method();

      expect(result).toBe(42);
    });

    it('field arrow fn returns wrapped initializer', async () => {
      class C {
        @LegacyAsyncMethod()
        method = function* (this: any): Generator<any, any, any> {
          return yield Promise.resolve(99);
        };
      }

      const inst = new C();
      const result = await inst.method();

      expect(result).toBe(99);
    });

    it('getter is memoized per instance', () => {
      let callCount = 0;

      class C {
        @LegacyAsyncMethod()
        get method() {
          callCount++;
          return function* () {
            yield Promise.resolve(5);
          };
        }
      }

      const inst1 = new C();
      const inst2 = new C();

      const fn1a = inst1.method;
      expect(callCount).toBe(1);

      const fn1b = inst1.method;
      expect(callCount).toBe(1);
      expect(fn1a).toBe(fn1b);

      const fn2 = inst2.method;
      expect(callCount).toBe(2);
      expect(fn1a).not.toBe(fn2);
    });

    it('multiple instances have independent methods', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyAsyncMethod()
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(this.id);
        }
      }

      const inst1 = new C(10);
      const inst2 = new C(20);

      expect(await inst1.method()).toBe(10);
      expect(await inst2.method()).toBe(20);
    });
  });

  describe('bind:true', () => {
    it('per-instance method is bound at construction', async () => {
      class C {
        @LegacyAsyncMethod({ bind: true })
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(this);
        }
      }

      const inst = new C();
      const method = inst.method;
      const resultThis = await method();

      expect(resultThis).toBe(inst);
    });

    it('per-instance field is bound at construction', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyAsyncMethod({ bind: true })
        method = function* (this: any): Generator<any, any, any> {
          return yield Promise.resolve(this.id);
        };
      }

      const inst = new C(42);
      const method = inst.method;
      const result = await method();

      expect(result).toBe(42);
    });

    it('getter returns a coroutine memoized and bound per instance', async () => {
      class C {
        @LegacyAsyncMethod({ bind: true })
        get method() {
          return cancAsync(function* (this: any): Generator<any, any, any> {
            return yield Promise.resolve(this);
          });
        }
      }

      const inst = new C();
      // Detached call: bind:true bound the coroutine to the instance, so `this` survives.
      const method = inst.method;
      const resultThis = await method();

      expect(resultThis).toBe(inst);
    });

    it('multiple instances have independent bound methods', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyAsyncMethod({ bind: true })
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(this.id);
        }
      }

      const inst1 = new C(100);
      const inst2 = new C(200);

      const method1 = inst1.method;
      const method2 = inst2.method;

      expect(await method1()).toBe(100);
      expect(await method2()).toBe(200);
      expect(method1).not.toBe(method2);
    });
  });

  describe('2-instance isolation', () => {
    it('bind:false — each instance calls its own method', async () => {
      const log: number[] = [];

      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyAsyncMethod()
        *method() {
          log.push(this.id);
          yield Promise.resolve();
        }
      }

      const inst1 = new C(1);
      const inst2 = new C(2);

      await inst1.method();
      await inst2.method();

      expect(log).toEqual([1, 2]);
    });

    it('bind:true — each instance has own bound method', async () => {
      const log: number[] = [];

      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyAsyncMethod({ bind: true })
        *method() {
          log.push(this.id);
          yield Promise.resolve();
        }
      }

      const inst1 = new C(1);
      const inst2 = new C(2);

      const method1 = inst1.method;
      const method2 = inst2.method;

      await method1();
      await method2();

      expect(log).toEqual([1, 2]);
    });
  });

  describe('GC assertion', () => {
    it('instance1 released while instance2 active — instance1 collects', async () => {
      if (!global.gc) {
        expect(global.gc).toBeUndefined();
        return;
      }

      const finalized: boolean[] = [];

      class GcA {
        @LegacyAsyncMethod({ bind: true })
        *method() {
          yield Promise.resolve(42);
        }
      }

      class GcB {
        @LegacyAsyncMethod({ bind: true })
        *method() {
          yield Promise.resolve(99);
        }
      }

      // Registry must outlive inst1, otherwise it is collected alongside inst1 and its callback
      // never runs.
      const registry = new FinalizationRegistry(() => {
        finalized.push(true);
      });

      // inst1 lives ONLY in this nested sync function. If it were a local of the async test body
      // it would be captured by the es5 generator state machine and pinned across the awaits below.
      const registerInstance1 = () => {
        const inst1 = new GcA();
        touch(inst1.method);
        registry.register(inst1, 'instance1');
      };
      registerInstance1();

      const inst2 = new GcB();

      touch(inst2.method);

      await forceCollect(() => finalized.length > 0);

      expect(finalized.length).toBeGreaterThan(0);
      expect(finalized[0]).toBe(true);
    });
  });
});

describe('decorators (TS legacy) — LegacyBindMethod', () => {
  describe('bind:true (default)', () => {
    it('proto method is bound per instance at construction', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyBindMethod()
        method() {
          return this.id;
        }
      }

      const inst = new C(50);
      const method = inst.method;
      const result = method();

      expect(result).toBe(50);
    });

    it('field arrow fn is bound per instance', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyBindMethod()
        method = function (this: any) {
          return this.id;
        };
      }

      const inst = new C(75);
      const method = inst.method;
      const result = method();

      expect(result).toBe(75);
    });

    it('getter result is bound per instance', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyBindMethod()
        get method() {
          return () => this.id;
        }
      }

      const inst = new C(25);
      const method = inst.method;
      const result = method();

      expect(result).toBe(25);
    });

    it('multiple instances have independent bound functions', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyBindMethod()
        method() {
          return this.id;
        }
      }

      const inst1 = new C(111);
      const inst2 = new C(222);

      const fn1 = inst1.method;
      const fn2 = inst2.method;

      expect(fn1()).toBe(111);
      expect(fn2()).toBe(222);
      expect(fn1).not.toBe(fn2);
    });
  });

  describe('bind:false', () => {
    it('proto method is not bound', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyBindMethod({ bind: false })
        method() {
          return this.id;
        }
      }

      const inst = new C(11);
      const method = inst.method;

      expect(() => method()).toThrow();
    });
  });

  describe('2-instance isolation', () => {
    it('default bind:true — each instance has own bound method', () => {
      const log: number[] = [];

      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @LegacyBindMethod()
        method() {
          log.push(this.id);
          return this.id;
        }
      }

      const inst1 = new C(1);
      const inst2 = new C(2);

      inst1.method();
      inst2.method();

      expect(log).toEqual([1, 2]);
    });
  });

  describe('GC assertion', () => {
    it('instance1 released while instance2 active — instance1 collects', async () => {
      if (!global.gc) {
        expect(global.gc).toBeUndefined();
        return;
      }

      const finalized: boolean[] = [];

      class GcA {
        @LegacyBindMethod()
        method() {
          return 42;
        }
      }

      class GcB {
        @LegacyBindMethod()
        method() {
          return 99;
        }
      }

      // Registry must outlive inst1, otherwise it is collected alongside inst1 and its callback
      // never runs.
      const registry = new FinalizationRegistry(() => {
        finalized.push(true);
      });

      // inst1 lives ONLY in this nested sync function. If it were a local of the async test body
      // it would be captured by the es5 generator state machine and pinned across the awaits below.
      const registerInstance1 = () => {
        const inst1 = new GcA();
        touch(inst1.method);
        registry.register(inst1, 'instance1');
      };
      registerInstance1();

      const inst2 = new GcB();

      touch(inst2.method);

      await forceCollect(() => finalized.length > 0);

      expect(finalized.length).toBeGreaterThan(0);
      expect(finalized[0]).toBe(true);
    });
  });
});

describe('decorators (TS legacy) — error handling', () => {
  it('LegacyAsyncMethod rejects non-method field', () => {
    expect(() => {
      class C {
        @LegacyAsyncMethod()
        notAMethod = 42;
      }
      new C();
    }).toThrow(TypeError);
  });

  it('LegacyBindMethod rejects non-method field', () => {
    expect(() => {
      class C {
        @LegacyBindMethod()
        notAMethod = 'string';
      }
      new C();
    }).toThrow(TypeError);
  });

  it('LegacyBindMethod rejects non-function getter result', () => {
    expect(() => {
      class C {
        @LegacyBindMethod()
        get method() {
          return 'not a function';
        }
      }
      // Reading the accessor is the operation under test.
      const _accessed = new C().method;
    }).toThrow(TypeError);
  });
});

// ============================================================================
// Metadata preservation (SetMetadata-style fn-level + key-level metadata)
// ============================================================================
//
// TS-legacy SetMetadata style: attach metadata to the method function (descriptor.value) identity.
// Our decorator rewrites descriptor.value with the coroutine/bound wrapper; the metadata must be
// copied across. Key-level metadata (prototype + property key) is never touched by wrapping.

const FN_META = 'fn-meta-key';
const KEY_META = 'key-meta-key';

// Legacy method decorator writing metadata onto the method FUNCTION (SetMetadata style).
// Typed `any` at the decorator boundary: a legacy decorator that must apply on methods here stacks
// with the library decorators, and TS's method-vs-property overload resolution across the stack is
// too strict to accept a precisely-typed local helper. The runtime shape is a normal legacy method
// decorator reading `descriptor.value`.
const SetFnMeta =
  (value: string): any =>
  (_target: any, _key: string | symbol, descriptor: PropertyDescriptor): void => {
    Reflect.defineMetadata(FN_META, value, descriptor.value);
  };

describe('decorators (TS legacy) — metadata preservation', () => {
  it('fn-level metadata survives LegacyAsyncMethod (meta below canc)', () => {
    class C {
      @LegacyAsyncMethod()
      @SetFnMeta('guards')
      *method(): Generator<any, any, any> {
        return yield Promise.resolve(1);
      }
    }

    const installed = C.prototype.method as TAnyFn;
    expect(Reflect.getOwnMetadata(FN_META, installed)).toBe('guards');
  });

  it('fn-level metadata survives LegacyAsyncMethod (meta above canc)', () => {
    class C {
      @SetFnMeta('interceptors')
      @LegacyAsyncMethod()
      *method(): Generator<any, any, any> {
        return yield Promise.resolve(1);
      }
    }

    const installed = C.prototype.method as TAnyFn;
    expect(Reflect.getOwnMetadata(FN_META, installed)).toBe('interceptors');
  });

  it('fn-level metadata survives LegacyBindMethod bind:false', () => {
    class C {
      @LegacyBindMethod({ bind: false })
      @SetFnMeta('roles')
      method() {
        return 1;
      }
    }

    const installed = C.prototype.method as TAnyFn;
    expect(Reflect.getOwnMetadata(FN_META, installed)).toBe('roles');
  });

  it('key-level metadata (prototype + propertyKey) is untouched by wrapping', () => {
    class C {
      @LegacyAsyncMethod()
      *method(): Generator<any, any, any> {
        return yield Promise.resolve(1);
      }
    }

    Reflect.defineMetadata(KEY_META, 'controller', C.prototype, 'method');
    expect(Reflect.getMetadata(KEY_META, C.prototype, 'method')).toBe('controller');
    expect(typeof C.prototype.method).toBe('function');
  });

  it('own name and arity are copied from the original onto the wrapper', () => {
    // A named function expression keeps its name/length through es5 emit; AsyncMethod builds a
    // fresh coroutine wrapper, so name/length must be copied across.
    class C {
      @LegacyAsyncMethod({ bind: false })
      method = function* original(this: any, _a: unknown, _b: unknown): Generator<any, any, any> {
        return yield Promise.resolve(1);
      };
    }

    const installed = new C().method as TAnyFn;
    expect(installed.name).toBe('original');
    expect(installed.length).toBe(2);
  });
});

// ============================================================================
// Flavor mismatch guard (wrong-shaped invocation)
// ============================================================================

// ============================================================================
// Getter returns a coroutine (new semantics) — full this-matrix
// ============================================================================
//
// The user builds the coroutine themselves with cancAsync inside the getter and returns it. The
// decorator no longer wraps a bare generator function; it only memoizes the returned coroutine
// per instance, and for bind:true binds it to the instance so a detached call keeps `this`.

describe('decorators (TS legacy) — getter returns a coroutine', () => {
  // Sentinel returned when the coroutine runs with no bound/call-site `this` (an unbound detached
  // call under bind:false — the documented unsafe edge).
  const SENTINEL = -1;

  // Shared coroutine body: reports the instance id, or the sentinel when `this` is missing.
  function* idBody(this: { id: number } | undefined): Generator<any, any, any> {
    return yield Promise.resolve(this ? this.id : SENTINEL);
  }

  // Case 1: @LegacyAsyncMethod() get m() { return cancAsync(fn, this) }
  // inst.m() resolves; a detached call still resolves because `, this` bound the coroutine.
  it('LegacyAsyncMethod with `, this` — call and detached call both resolve the instance id', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }

      @LegacyAsyncMethod()
      get run() {
        return cancAsync(idBody, this);
      }
    }

    const inst = new C(7);
    const promise = inst.run();

    expect(typeof (promise as any).cancel).toBe('function');
    expect(await promise).toBe(7);

    const detached = inst.run;
    expect(await detached()).toBe(7);
  });

  // Case 2: memoized once per instance; same identity across accesses; distinct per instance;
  // each instance resolves its own id.
  it('memoizes the returned coroutine once per instance, isolated across instances', async () => {
    let calls = 0;

    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }

      @LegacyAsyncMethod()
      get run() {
        calls++;
        return cancAsync(idBody, this);
      }
    }

    const inst1 = new C(11);
    const inst2 = new C(22);

    const first = inst1.run;
    const second = inst1.run;

    expect(calls).toBe(1);
    expect(first).toBe(second);

    const other = inst2.run;
    expect(calls).toBe(2);
    expect(other).not.toBe(first);

    expect(await first()).toBe(11);
    expect(await other()).toBe(22);
  });

  // Case 3: @LegacyAsyncMethod() get m() { return cancAsync(fn) } (omit `, this`).
  // A normal call carries call-site `this`; a detached call loses it (documented unsafe edge).
  it('LegacyAsyncMethod without `, this` — call-site this works, detached call loses this', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }

      @LegacyAsyncMethod()
      get run() {
        return cancAsync(idBody);
      }
    }

    const inst = new C(9);

    expect(await inst.run()).toBe(9);

    // Detached: no bound this, so the coroutine sees `this === undefined` and returns the sentinel.
    const detached = inst.run;
    expect(await detached()).toBe(SENTINEL);
  });

  // Case 4: @LegacyBindMethod() get m() { return cancAsync(fn) } (omit `, this`).
  // The decorator binds the coroutine to the instance, so a detached call keeps this.
  it('LegacyBindMethod without `, this` — decorator binds, detached call resolves the instance id', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }

      @LegacyBindMethod()
      get run() {
        return cancAsync(idBody);
      }
    }

    const inst = new C(3);
    const detached = inst.run;

    expect(await detached()).toBe(3);
  });

  // Case 5: @LegacyBindMethod() get m() { return cancAsync(fn, this) }.
  // The `.bind` is a no-op over an already-bound coroutine; detached call still resolves.
  it('LegacyBindMethod with `, this` — bind is a no-op, detached call still resolves the instance id', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }

      @LegacyBindMethod()
      get run() {
        return cancAsync(idBody, this);
      }
    }

    const inst = new C(5);
    const detached = inst.run;

    expect(await detached()).toBe(5);
  });

  // Case 6: a non-function getter result is rejected.
  it('throws a TypeError when the getter result is not a function', () => {
    expect(() => {
      class C {
        @LegacyAsyncMethod()
        get run() {
          return 42 as any;
        }
      }

      // Reading the accessor is the operation under test.
      const _accessed = new C().run;
    }).toThrow(TypeError);
  });

  // Case 7: cancellation. inst.m() is a CancelablePromise; cancel surfaces a CancelError through
  // try/catch; canceling inst1's call leaves inst2's independent call untouched.
  it('cancel surfaces a CancelError and does not disturb another instance', async () => {
    class C {
      @LegacyAsyncMethod()
      get run() {
        return cancAsync(function* (): Generator<any, any, any> {
          return yield new Promise(() => {});
        });
      }
    }

    const inst1 = new C();
    const inst2 = new C();

    const pending1 = inst1.run();
    const pending2 = inst2.run();

    expect(typeof (pending1 as any).cancel).toBe('function');

    (pending1 as any).cancel();

    let caught: unknown;
    try {
      await pending1;
    } catch (error) {
      caught = error;
    }

    expect(isCancelError(caught)).toBe(true);

    // inst2's call is still pending (not disturbed by inst1's cancel); resolve it deterministically.
    let disturbed: unknown;
    const race = Promise.race([
      pending2.then(
        () => 'settled',
        (error: unknown) => {
          disturbed = error;
          return 'rejected';
        },
      ),
      delay(20).then(() => 'pending'),
    ]);

    expect(await race).toBe('pending');
    expect(disturbed).toBeUndefined();

    (pending2 as any).cancel();
    try {
      await pending2;
    } catch {
      // canceled on purpose to avoid an unhandled rejection.
    }
  });
});

describe('decorators (TS legacy) — flavor mismatch guard', () => {
  it('LegacyAsyncMethod rejects stage-3 call shape (value, context)', () => {
    function* method(): Generator<any, any, any> {
      return yield Promise.resolve(1);
    }

    expect(() => {
      (LegacyAsyncMethod() as any)(method, { kind: 'method', name: 'method' });
    }).toThrow(/stage-3/i);

    expect(() => {
      (LegacyAsyncMethod() as any)(method, { kind: 'method', name: 'method' });
    }).toThrow(/@cancjs\/decorators/);
  });

  it('LegacyBindMethod rejects stage-3 call shape (value, context)', () => {
    function method() {}

    expect(() => {
      (LegacyBindMethod() as any)(method, { kind: 'method', name: 'method' });
    }).toThrow(/@cancjs\/decorators/);
  });

  it('LegacyAsyncMethod rejects babel-legacy-shaped descriptor (has `initializer`)', () => {
    class C {}

    expect(() => {
      (LegacyAsyncMethod() as any)(C.prototype, 'field', {
        initializer: () => function* () {},
        configurable: true,
      });
    }).toThrow(/babel-legacy/i);
  });

  it('cross-call via actual stage-3 entry point throws the guard error, not a shape crash', () => {
    function* method(): Generator<any, any, any> {
      return yield Promise.resolve(1);
    }

    expect(() => {
      // AsyncMethod applied with legacy args (target, propertyKey, descriptor) instead of (value, context).
      (AsyncMethod as any)({}, 'method', { value: method, configurable: true, writable: true });
    }).toThrow(/@cancjs\/decorators\/legacy/);
  });

  it('LegacyAsyncMethod accepts a babel-legacy import used correctly elsewhere without cross-contamination', () => {
    // Sanity: babel-legacy entry point itself still works when called with its own shape, proving
    // the guard above is about shape detection, not blanket rejection of `initializer`-bearing objects.
    const descriptor = {
      initializer: function (this: any) {
        return function* (this: any): Generator<any, any, any> {
          return yield Promise.resolve(7);
        };
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    expect(() => {
      BabelLegacyAsyncMethod({}, 'field', descriptor as any);
    }).not.toThrow();
  });
});
