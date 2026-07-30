import 'reflect-metadata';

import { async as cancAsync } from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';

import { AsyncMethod } from './decorators';
import { BabelLegacyAsyncMethod, BabelLegacyBindMethod } from './decorators-babel-legacy';

/**
 * Babel legacy decorators matrix.
 *
 * Unlike ES/TS decorator syntax specs, this one manually invokes the babel-legacy decorator
 * functions and applies them to hand-constructed prototype descriptors (mimicking what babel
 * emits: `{ initializer, configurable, enumerable, writable }` for fields, and full descriptor
 * for methods/getters). No babel toolchain needed; tests the runtime shape directly.
 *
 * Same matrix: 3 decorator types × 3 member types × 2 instance isolation + GC assertion.
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

function* simpleGenerator(): Generator<any, any, any> {
  return yield Promise.resolve(42);
}

function* idGenerator(this: any): Generator<any, any, any> {
  return yield Promise.resolve(this.id);
}

/**
 * Emulate babel loose-mode class-field construction for a decorated field. Babel does not put the
 * field descriptor on the prototype; it invokes the (decorator-rewritten) `initializer` with the
 * instance as `this` during construction and assigns the returned value as an own property. The
 * decorator functions return the mutated descriptor, so applying that descriptor's initializer is
 * exactly what the babel runtime does per instance.
 */
function applyBabelField(instance: any, key: string | symbol, descriptor: any) {
  const value = descriptor.initializer ? descriptor.initializer.call(instance) : undefined;
  Object.defineProperty(instance, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return instance;
}

describe('decorators (babel-legacy) — BabelLegacyAsyncMethod', () => {
  describe('bind:false (default)', () => {
    it('proto method wraps at decoration time', async () => {
      class C {
        id = 42;
      }

      const descriptor = {
        value: simpleGenerator,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst = new C() as any;
      const result = await inst.method();

      expect(result).toBe(42);
    });

    it('field with initializer wraps at construction', async () => {
      class C {
        id = 99;
      }

      const descriptor = {
        initializer: function (this: any) {
          return function* (this: any): Generator<any, any, any> {
            return yield Promise.resolve(this.id);
          };
        },
        writable: true,
        enumerable: true,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);

      const inst = new C() as any;
      inst.id = 99;
      applyBabelField(inst, 'method', descriptor);
      const result = await inst.method();

      expect(result).toBe(99);
    });

    it('getter is memoized per instance', () => {
      let callCount = 0;

      class C {}

      const descriptor = {
        get() {
          callCount++;
          return function* () {
            yield Promise.resolve(5);
          };
        },
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst1 = new C() as any;
      const inst2 = new C() as any;

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
      }

      const descriptor = {
        value: idGenerator,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst1 = new C(10) as any;
      const inst2 = new C(20) as any;

      expect(await inst1.method()).toBe(10);
      expect(await inst2.method()).toBe(20);
    });
  });

  describe('bind:true', () => {
    it('per-instance method is bound', async () => {
      class C {}

      const descriptor = {
        value: function* (this: any): Generator<any, any, any> {
          return this;
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod({ bind: true })(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst = new C() as any;
      const method = inst.method;
      const resultThis = await method();

      expect(resultThis).toBe(inst);
    });

    it('per-instance field is bound', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }
      }

      const descriptor = {
        initializer: function (this: any) {
          return function* (this: any): Generator<any, any, any> {
            return yield Promise.resolve(this.id);
          };
        },
        writable: true,
        enumerable: true,
        configurable: true,
      };

      BabelLegacyAsyncMethod({ bind: true })(C.prototype, 'method', descriptor);

      const inst = new C(42) as any;
      applyBabelField(inst, 'method', descriptor);
      const method = inst.method;
      const result = await method();

      expect(result).toBe(42);
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
      }

      const descriptor = {
        value: function* (this: any): Generator<any, any, any> {
          log.push(this.id);
          yield Promise.resolve();
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst1 = new C(1) as any;
      const inst2 = new C(2) as any;

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
      }

      const descriptor = {
        value: function* (this: any): Generator<any, any, any> {
          log.push(this.id);
          yield Promise.resolve();
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod({ bind: true })(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst1 = new C(1) as any;
      const inst2 = new C(2) as any;

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
      // Registry must outlive inst1, otherwise it is collected alongside inst1 and its callback
      // never runs.
      const registry = new FinalizationRegistry(() => {
        finalized.push(true);
      });

      // inst1 lives ONLY in this nested sync function. If it were a local of the async test body
      // it would be captured by the es5 generator state machine and pinned across the awaits below.
      const registerInstance1 = () => {
        class C {}

        const descriptor = {
          value: function (this: any) {
            return 42;
          },
          writable: true,
          enumerable: false,
          configurable: true,
        };

        BabelLegacyAsyncMethod({ bind: true })(C.prototype, 'method', descriptor);
        Object.defineProperty(C.prototype, 'method', descriptor);

        const inst1 = new C() as any;
        touch(inst1.method);

        registry.register(inst1, 'instance1');
      };
      registerInstance1();

      {
        class C2 {}

        const descriptor = {
          value: function (this: any) {
            return 99;
          },
          writable: true,
          enumerable: false,
          configurable: true,
        };

        BabelLegacyAsyncMethod({ bind: true })(C2.prototype, 'method', descriptor);
        Object.defineProperty(C2.prototype, 'method', descriptor);

        const inst2 = new C2() as any;
        touch(inst2.method);
      }

      await forceCollect(() => finalized.length > 0);

      expect(finalized.length).toBeGreaterThan(0);
      expect(finalized[0]).toBe(true);
    });
  });
});

describe('decorators (babel-legacy) — BabelLegacyBindMethod', () => {
  describe('bind:true (default)', () => {
    it('proto method is bound per instance', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }
      }

      const descriptor = {
        value: function (this: any) {
          return this.id;
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyBindMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst = new C(50) as any;
      const method = inst.method;
      const result = method();

      expect(result).toBe(50);
    });

    it('field arrow fn is bound per instance', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }
      }

      const descriptor = {
        initializer: function (this: any) {
          return function (this: any) {
            return this.id;
          };
        },
        writable: true,
        enumerable: true,
        configurable: true,
      };

      BabelLegacyBindMethod(C.prototype, 'method', descriptor);

      const inst = new C(75) as any;
      applyBabelField(inst, 'method', descriptor);
      const method = inst.method;
      const result = method();

      expect(result).toBe(75);
    });

    it('multiple instances have independent bound functions', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }
      }

      const descriptor = {
        value: function (this: any) {
          return this.id;
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyBindMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst1 = new C(111) as any;
      const inst2 = new C(222) as any;

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
      }

      const descriptor = {
        value: function (this: any) {
          return this.id;
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyBindMethod({ bind: false })(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst = new C(11) as any;
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
      }

      const descriptor = {
        value: function (this: any) {
          log.push(this.id);
          return this.id;
        },
        writable: true,
        enumerable: false,
        configurable: true,
      };

      BabelLegacyBindMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      const inst1 = new C(1) as any;
      const inst2 = new C(2) as any;

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
      // Registry must outlive inst1, otherwise it is collected alongside inst1 and its callback
      // never runs.
      const registry = new FinalizationRegistry(() => {
        finalized.push(true);
      });

      // inst1 lives ONLY in this nested sync function. If it were a local of the async test body
      // it would be captured by the es5 generator state machine and pinned across the awaits below.
      const registerInstance1 = () => {
        class C {}

        const descriptor = {
          value: function (this: any) {
            return 42;
          },
          writable: true,
          enumerable: false,
          configurable: true,
        };

        BabelLegacyBindMethod(C.prototype, 'method', descriptor);
        Object.defineProperty(C.prototype, 'method', descriptor);

        const inst1 = new C() as any;
        touch(inst1.method);

        registry.register(inst1, 'instance1');
      };
      registerInstance1();

      {
        class C2 {}

        const descriptor = {
          value: function (this: any) {
            return 99;
          },
          writable: true,
          enumerable: false,
          configurable: true,
        };

        BabelLegacyBindMethod(C2.prototype, 'method', descriptor);
        Object.defineProperty(C2.prototype, 'method', descriptor);

        const inst2 = new C2() as any;
        touch(inst2.method);
      }

      await forceCollect(() => finalized.length > 0);

      expect(finalized.length).toBeGreaterThan(0);
      expect(finalized[0]).toBe(true);
    });
  });
});

describe('decorators (babel-legacy) — error handling', () => {
  it('BabelLegacyAsyncMethod rejects non-function field initializer', () => {
    expect(() => {
      class C {}

      const descriptor = {
        initializer: () => 42,
        writable: true,
        enumerable: true,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);

      const inst = new C() as any;
      // Babel invokes the (rewritten) initializer per instance at construction; it must reject a
      // non-function initial value.
      applyBabelField(inst, 'method', descriptor);
    }).toThrow(TypeError);
  });

  it('BabelLegacyBindMethod rejects non-function getter result', () => {
    expect(() => {
      class C {}

      const descriptor = {
        get() {
          return 'not a function';
        },
        enumerable: false,
        configurable: true,
      };

      BabelLegacyBindMethod(C.prototype, 'method', descriptor);
      Object.defineProperty(C.prototype, 'method', descriptor);

      (new C() as any).method;
    }).toThrow(TypeError);
  });
});

// ============================================================================
// Metadata preservation (SetMetadata-style fn-level + key-level metadata)
// ============================================================================
//
// Babel-legacy SetMetadata style: metadata attached to the method function (descriptor.value)
// before our decorator rewrites descriptor.value with the coroutine/bound wrapper. The metadata
// must be copied onto the wrapper. Key-level metadata (prototype + property key) is untouched.

const FN_META = 'fn-meta-key';
const KEY_META = 'key-meta-key';

function methodDescriptor(fn: Function): any {
  return { value: fn, writable: true, enumerable: false, configurable: true };
}

describe('decorators (babel legacy) — metadata preservation', () => {
  it('fn-level metadata survives BabelLegacyAsyncMethod bind:false', () => {
    function original(): Generator<any, any, any> {
      return (function* () {
        return yield Promise.resolve(1);
      })();
    }
    // SetMetadata style: metadata sits on the original method fn before our decorator wraps it.
    Reflect.defineMetadata(FN_META, 'guards', original);

    const descriptor = methodDescriptor(original);
    BabelLegacyAsyncMethod(class {}.prototype, 'method', descriptor);

    expect(descriptor.value).not.toBe(original);
    expect(Reflect.getOwnMetadata(FN_META, descriptor.value)).toBe('guards');
  });

  it('fn-level metadata survives BabelLegacyBindMethod bind:false', () => {
    function original() {
      return 1;
    }
    Reflect.defineMetadata(FN_META, 'roles', original);

    const descriptor = methodDescriptor(original);
    (BabelLegacyBindMethod({ bind: false }) as any)(class {}.prototype, 'method', descriptor);

    // bind:false BindMethod keeps the original function identity, so its metadata is inherently
    // preserved; the assertion still guards against accidental loss.
    expect(Reflect.getOwnMetadata(FN_META, descriptor.value)).toBe('roles');
  });

  it('key-level metadata (prototype + propertyKey) is untouched by wrapping', () => {
    class C {}
    function original(): Generator<any, any, any> {
      return (function* () {
        return yield Promise.resolve(1);
      })();
    }
    const descriptor = methodDescriptor(original);
    BabelLegacyAsyncMethod(C.prototype, 'method', descriptor);
    Object.defineProperty(C.prototype, 'method', descriptor);

    Reflect.defineMetadata(KEY_META, 'controller', C.prototype, 'method');
    expect(Reflect.getMetadata(KEY_META, C.prototype, 'method')).toBe('controller');
    expect(typeof descriptor.value).toBe('function');
  });

  it('own name and arity are copied from the original onto the wrapper', () => {
    function* original(this: any, _a: unknown, _b: unknown): Generator<any, any, any> {
      return yield Promise.resolve(1);
    }
    const descriptor = methodDescriptor(original);
    BabelLegacyAsyncMethod(class {}.prototype, 'method', descriptor);

    expect(descriptor.value).not.toBe(original);
    expect(descriptor.value.name).toBe('original');
    expect(descriptor.value.length).toBe(2);
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

describe('decorators (babel-legacy) — getter returns a coroutine', () => {
  // Sentinel returned when the coroutine runs with no bound/call-site `this` (an unbound detached
  // call under bind:false — the documented unsafe edge).
  const SENTINEL = -1;

  // Shared coroutine body: reports the instance id, or the sentinel when `this` is missing.
  function* idBody(this: { id: number } | undefined): Generator<any, any, any> {
    return yield Promise.resolve(this ? this.id : SENTINEL);
  }

  // Case 1: BabelLegacyAsyncMethod on a getter returning cancAsync(fn, this).
  // inst.m() resolves; a detached call still resolves because `, this` bound the coroutine.
  it('BabelLegacyAsyncMethod with `, this` — call and detached call both resolve the instance id', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }
    }

    const descriptor: any = {
      get(this: any) {
        return cancAsync(idBody, this);
      },
      enumerable: false,
      configurable: true,
    };

    BabelLegacyAsyncMethod(C.prototype, 'run', descriptor);
    Object.defineProperty(C.prototype, 'run', descriptor);

    const inst = new C(7) as any;
    const promise = inst.run();

    expect(typeof promise.cancel).toBe('function');
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
    }

    const descriptor: any = {
      get(this: any) {
        calls++;
        return cancAsync(idBody, this);
      },
      enumerable: false,
      configurable: true,
    };

    BabelLegacyAsyncMethod(C.prototype, 'run', descriptor);
    Object.defineProperty(C.prototype, 'run', descriptor);

    const inst1 = new C(11) as any;
    const inst2 = new C(22) as any;

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

  // Case 3: BabelLegacyAsyncMethod on a getter returning cancAsync(fn) (omit `, this`).
  // A normal call carries call-site `this`; a detached call loses it (documented unsafe edge).
  it('BabelLegacyAsyncMethod without `, this` — call-site this works, detached call loses this', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }
    }

    const descriptor: any = {
      get() {
        return cancAsync(idBody);
      },
      enumerable: false,
      configurable: true,
    };

    BabelLegacyAsyncMethod(C.prototype, 'run', descriptor);
    Object.defineProperty(C.prototype, 'run', descriptor);

    const inst = new C(9) as any;

    expect(await inst.run()).toBe(9);

    // Detached: no bound this, so the coroutine sees `this === undefined` and returns the sentinel.
    const detached = inst.run;
    expect(await detached()).toBe(SENTINEL);
  });

  // Case 4: BabelLegacyBindMethod on a getter returning cancAsync(fn) (omit `, this`).
  // The decorator binds the coroutine to the instance, so a detached call keeps this.
  it('BabelLegacyBindMethod without `, this` — decorator binds, detached call resolves the instance id', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }
    }

    const descriptor: any = {
      get() {
        return cancAsync(idBody);
      },
      enumerable: false,
      configurable: true,
    };

    BabelLegacyBindMethod(C.prototype, 'run', descriptor);
    Object.defineProperty(C.prototype, 'run', descriptor);

    const inst = new C(3) as any;
    const detached = inst.run;

    expect(await detached()).toBe(3);
  });

  // Case 5: BabelLegacyBindMethod on a getter returning cancAsync(fn, this).
  // The `.bind` is a no-op over an already-bound coroutine; detached call still resolves.
  it('BabelLegacyBindMethod with `, this` — bind is a no-op, detached call still resolves the instance id', async () => {
    class C {
      id: number;

      constructor(id: number) {
        this.id = id;
      }
    }

    const descriptor: any = {
      get(this: any) {
        return cancAsync(idBody, this);
      },
      enumerable: false,
      configurable: true,
    };

    BabelLegacyBindMethod(C.prototype, 'run', descriptor);
    Object.defineProperty(C.prototype, 'run', descriptor);

    const inst = new C(5) as any;
    const detached = inst.run;

    expect(await detached()).toBe(5);
  });

  // Case 6: a non-function getter result is rejected.
  it('throws a TypeError when the getter result is not a function', () => {
    expect(() => {
      class C {}

      const descriptor: any = {
        get() {
          return 42;
        },
        enumerable: false,
        configurable: true,
      };

      BabelLegacyAsyncMethod(C.prototype, 'run', descriptor);
      Object.defineProperty(C.prototype, 'run', descriptor);

      (new C() as any).run;
    }).toThrow(TypeError);
  });

  // Case 7: cancellation. inst.m() is a CancelablePromise; cancel surfaces a CancelError through
  // try/catch; canceling inst1's call leaves inst2's independent call untouched.
  it('cancel surfaces a CancelError and does not disturb another instance', async () => {
    class C {}

    const descriptor: any = {
      get() {
        return cancAsync(function* (): Generator<any, any, any> {
          return yield new Promise(() => {});
        });
      },
      enumerable: false,
      configurable: true,
    };

    BabelLegacyAsyncMethod(C.prototype, 'run', descriptor);
    Object.defineProperty(C.prototype, 'run', descriptor);

    const inst1 = new C() as any;
    const inst2 = new C() as any;

    const pending1 = inst1.run();
    const pending2 = inst2.run();

    expect(typeof pending1.cancel).toBe('function');

    pending1.cancel();

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

    pending2.cancel();
    try {
      await pending2;
    } catch {
      // canceled on purpose to avoid an unhandled rejection.
    }
  });
});

describe('decorators (babel legacy) — flavor mismatch guard', () => {
  it('BabelLegacyAsyncMethod rejects stage-3 call shape (value, context)', () => {
    function* method(): Generator<any, any, any> {
      return yield Promise.resolve(1);
    }

    expect(() => {
      (BabelLegacyAsyncMethod() as any)(method, { kind: 'method', name: 'method' });
    }).toThrow(/stage-3/i);

    expect(() => {
      (BabelLegacyAsyncMethod() as any)(method, { kind: 'method', name: 'method' });
    }).toThrow(/@cancjs\/decorators/);
  });

  it('BabelLegacyBindMethod rejects stage-3 call shape (value, context)', () => {
    function method() {}

    expect(() => {
      (BabelLegacyBindMethod() as any)(method, { kind: 'method', name: 'method' });
    }).toThrow(/@cancjs\/decorators/);
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
});
