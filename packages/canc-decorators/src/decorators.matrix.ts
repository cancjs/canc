import 'reflect-metadata';

import { async as cancAsync } from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';

/**
 * ES / TC39 stage-3 decorators matrix, shared between the ts-jest lane (decorators.spec.ts,
 * native TS 5+ decorator emit) and the babel lane (babel-stage3/decorators.spec.ts,
 * `@babel/plugin-proposal-decorators` "2023-05" emit). Both compilers target the same stage-3
 * proposal shape, so one source of decorator-syntax assertions proves both toolchains produce a
 * runtime AsyncMethod/BindMethod can consume correctly. Each lane's own thin spec file imports its
 * own compiled `AsyncMethod`/`BindMethod`/etc and calls `runStage3Matrix` with them.
 *
 * Matrix: 3 decorator types (AsyncMethod/BindMethod, no param vs bind:true/false) ×
 * 3 member types (method, field, getter) × 2 instance isolation matrix (2+ instances,
 * each gets own-bound fn, no cross-instance state corruption).
 *
 * GC assertion: instance1 discarded while instance2 active; instance1 must be collectable
 * (verifies fix for prototype-based Map caching that pinned instances forever).
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

export interface IStage3MatrixDecorators {
  AsyncMethod: any;
  BindMethod: any;
  LegacyAsyncMethod: any;
  BabelLegacyAsyncMethod: any;
  // Set by the babel lane only. @babel/plugin-proposal-decorators (7.29.7, version "2023-05")
  // throws "Cannot read properties of undefined (reading 'call')" at class-definition time for a
  // decorated class FIELD when a plain, non-decorated field is declared earlier in the same class
  // body (order: plain field, then decorated field) — confirmed by isolated reproduction outside
  // AsyncMethod/BindMethod entirely (a bare identity decorator hits the same crash under the same
  // field ordering). Native TS 5+ emit and TS/babel legacy decorators are unaffected. The two
  // matrix cases below use exactly that ordering to also exercise `this` access inside the field
  // initializer; skipped only on the babel lane rather than reordering the shared assertions
  // (reordering would silently hide a real babel-toolchain field-ordering constraint).
  skipBabelFieldOrderingCases?: boolean;
}

export function runStage3Matrix({
  AsyncMethod,
  BindMethod,
  LegacyAsyncMethod,
  BabelLegacyAsyncMethod,
  skipBabelFieldOrderingCases,
}: IStage3MatrixDecorators): void {
  const itUnlessBabelFieldOrdering = skipBabelFieldOrderingCases ? it.skip : it;
  // ============================================================================
  // AsyncMethod tests
  // ============================================================================

  describe('decorators (ES stage-3) — AsyncMethod', () => {
    describe('bind:false (default)', () => {
      it('proto method wraps at decoration time', async () => {
        class C {
          @AsyncMethod()
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
          @AsyncMethod()
          method = function* (this: any): Generator<any, any, any> {
            return yield Promise.resolve(99);
          };
        }

        const inst = new C();
        const result = await inst.method();

        expect(result).toBe(99);
      });

      it('getter returning a coroutine is memoized per instance (called once)', () => {
        let callCount = 0;

        class C {
          @AsyncMethod()
          get method() {
            callCount++;
            return cancAsync(function* (): Generator<any, any, any> {
              return yield Promise.resolve(5);
            });
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

          @AsyncMethod()
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
          @AsyncMethod({ bind: true })
          *method(): Generator<any, any, any> {
            return yield Promise.resolve(this);
          }
        }

        const inst = new C();
        const method = inst.method;
        const resultThis = await method();

        expect(resultThis).toBe(inst);
      });

      itUnlessBabelFieldOrdering('per-instance field is bound at construction', async () => {
        class C {
          id: number;

          constructor(id: number) {
            this.id = id;
          }

          @AsyncMethod({ bind: true })
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
          @AsyncMethod({ bind: true })
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

          @AsyncMethod({ bind: true })
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

          @AsyncMethod()
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

          @AsyncMethod({ bind: true })
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
        // Registry must outlive inst1, otherwise it is collected alongside inst1 and its callback
        // never runs.
        const registry = new FinalizationRegistry(() => {
          finalized.push(true);
        });

        // inst1 lives ONLY in this nested sync function. If it were a local of the async test body
        // it would be captured by the es5 generator state machine and pinned across the awaits below.
        const registerInstance1 = () => {
          const inst1 = new (class {
            @AsyncMethod({ bind: true })
            *method() {
              yield Promise.resolve(42);
            }
          })();

          touch(inst1.method);
          registry.register(inst1, 'instance1');
        };
        registerInstance1();

        const inst2 = new (class {
          @AsyncMethod({ bind: true })
          *method() {
            yield Promise.resolve(99);
          }
        })();

        touch(inst2.method);

        await forceCollect(() => finalized.length > 0);

        expect(finalized.length).toBeGreaterThan(0);
        expect(finalized[0]).toBe(true);
      });
    });
  });

  // ============================================================================
  // BindMethod tests
  // ============================================================================

  describe('decorators (ES stage-3) — BindMethod', () => {
    describe('bind:true (default)', () => {
      it('proto method is bound per instance at construction', async () => {
        class C {
          id: number;

          constructor(id: number) {
            this.id = id;
          }

          @BindMethod()
          method() {
            return this.id;
          }
        }

        const inst = new C(50);
        const method = inst.method;
        const result = method();

        expect(result).toBe(50);
      });

      itUnlessBabelFieldOrdering('field arrow fn is bound per instance', async () => {
        class C {
          id: number;

          constructor(id: number) {
            this.id = id;
          }

          @BindMethod()
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

          @BindMethod()
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

          @BindMethod()
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

          @BindMethod({ bind: false })
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

          @BindMethod()
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
        // Registry must outlive inst1, otherwise it is collected alongside inst1 and its callback
        // never runs.
        const registry = new FinalizationRegistry(() => {
          finalized.push(true);
        });

        // inst1 lives ONLY in this nested sync function. If it were a local of the async test body
        // it would be captured by the es5 generator state machine and pinned across the awaits below.
        const registerInstance1 = () => {
          const inst1 = new (class {
            @BindMethod()
            method() {
              return 42;
            }
          })();

          touch(inst1.method);
          registry.register(inst1, 'instance1');
        };
        registerInstance1();

        const inst2 = new (class {
          @BindMethod()
          method() {
            return 99;
          }
        })();

        touch(inst2.method);

        await forceCollect(() => finalized.length > 0);

        expect(finalized.length).toBeGreaterThan(0);
        expect(finalized[0]).toBe(true);
      });
    });
  });

  // ============================================================================
  // Error cases
  // ============================================================================

  describe('decorators (ES stage-3) — error handling', () => {
    it('AsyncMethod rejects non-method field', () => {
      expect(() => {
        class C {
          @AsyncMethod()
          notAMethod = 42;
        }
        new C();
      }).toThrow(TypeError);
    });

    it('BindMethod rejects non-method field', () => {
      expect(() => {
        class C {
          @BindMethod()
          notAMethod = 'string';
        }
        new C();
      }).toThrow(TypeError);
    });

    it('BindMethod rejects non-function getter result', () => {
      expect(() => {
        class C {
          @BindMethod()
          get method() {
            return 'not a function';
          }
        }
        new C().method;
      }).toThrow(TypeError);
    });
  });

  // ============================================================================
  // Metadata preservation (SetMetadata-style fn-level + key-level metadata)
  // ============================================================================
  //
  // A SetMetadata-style helper (nest's @SetMetadata et al) attaches metadata to the METHOD FUNCTION
  // itself via reflect-metadata, keyed on that function's identity. Our decorator replaces the method
  // with a coroutine/bound wrapper, so unless we copy the metadata across it is silently lost.
  // Key-level metadata (keyed on prototype + property key) is never touched by wrapping and must also
  // survive. Both decorator orders are exercised.

  const FN_META = 'fn-meta-key';
  const KEY_META = 'key-meta-key';

  // Stage-3 method decorator: writes metadata onto the method FUNCTION identity (SetMetadata style).
  function SetFnMeta(value: string) {
    return function (target: Function, _context: ClassMethodDecoratorContext): void {
      Reflect.defineMetadata(FN_META, value, target);
    };
  }

  describe('decorators (stage-3) — metadata preservation', () => {
    it('fn-level metadata survives AsyncMethod (meta below canc)', () => {
      class C {
        @AsyncMethod()
        @SetFnMeta('guards')
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(1);
        }
      }

      const installed = C.prototype.method as Function;
      expect(Reflect.getOwnMetadata(FN_META, installed)).toBe('guards');
    });

    it('fn-level metadata survives AsyncMethod (meta above canc)', () => {
      class C {
        @SetFnMeta('interceptors')
        @AsyncMethod()
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(1);
        }
      }

      const installed = C.prototype.method as Function;
      expect(Reflect.getOwnMetadata(FN_META, installed)).toBe('interceptors');
    });

    it('fn-level metadata survives BindMethod bind:false', () => {
      class C {
        @BindMethod({ bind: false })
        @SetFnMeta('roles')
        method() {
          return 1;
        }
      }

      const installed = C.prototype.method as Function;
      expect(Reflect.getOwnMetadata(FN_META, installed)).toBe('roles');
    });

    it('key-level metadata (prototype + propertyKey) is untouched by wrapping', () => {
      class C {
        @AsyncMethod()
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(1);
        }
      }

      Reflect.defineMetadata(KEY_META, 'controller', C.prototype, 'method');
      expect(Reflect.getMetadata(KEY_META, C.prototype, 'method')).toBe('controller');
      expect(typeof C.prototype.method).toBe('function');
    });

    it('own name and arity are copied from the original onto the wrapper', () => {
      // A named function expression carries a stable name/length through es5 emit (unlike class
      // methods, whose names are erased under the decorator transform). AsyncMethod produces a fresh
      // coroutine wrapper, so name/length must be copied across.
      class C {
        @AsyncMethod({ bind: false })
        method = function* original(this: any, _a: unknown, _b: unknown): Generator<any, any, any> {
          return yield Promise.resolve(1);
        };
      }

      const installed = new C().method as Function;
      expect(installed.name).toBe('original');
      expect(installed.length).toBe(2);
    });
  });

  // ============================================================================
  // Flavor mismatch guard (wrong-shaped invocation)
  // ============================================================================
  //
  // Each decorator flavor is invoked directly (bypassing decorator syntax) with the runtime call
  // shape another flavor's compiler output would produce. AsyncMethod/BindMethod share the guard
  // (makeDecorator), so one representative per shape is enough to cover both.

  describe('decorators (ES stage-3) — flavor mismatch guard', () => {
    it('AsyncMethod rejects TS-legacy call shape (target, propertyKey, descriptor)', () => {
      class C {
        method() {}
      }

      expect(() => {
        (AsyncMethod() as any)(C.prototype, 'method', Object.getOwnPropertyDescriptor(C.prototype, 'method'));
      }).toThrow(/legacy/i);

      expect(() => {
        (AsyncMethod() as any)(C.prototype, 'method', Object.getOwnPropertyDescriptor(C.prototype, 'method'));
      }).toThrow(/@cancjs\/decorators\/legacy/);
    });

    it('BindMethod rejects TS-legacy call shape (target, propertyKey, descriptor)', () => {
      class C {
        method() {}
      }

      expect(() => {
        (BindMethod() as any)(C.prototype, 'method', Object.getOwnPropertyDescriptor(C.prototype, 'method'));
      }).toThrow(/@cancjs\/decorators\/legacy/);
    });

    it('AsyncMethod rejects TS-legacy field call shape (target, propertyKey) — no descriptor', () => {
      class C {}

      expect(() => {
        (AsyncMethod() as any)(C.prototype, 'field');
      }).toThrow(/@cancjs\/decorators\/legacy/);
    });

    it('AsyncMethod rejects babel-legacy call shape (target, propertyKey, descriptor w/ initializer)', () => {
      class C {}

      expect(() => {
        (AsyncMethod() as any)(C.prototype, 'field', { initializer: () => function* () {}, configurable: true });
      }).toThrow(/@cancjs\/decorators\/(legacy|babel-legacy)/);
    });

    it('cross-call via actual legacy entry points throws the guard error, not a shape crash', () => {
      class C {
        method() {}
      }

      // LegacyAsyncMethod applied with stage-3 args (value, context) instead of (target, key, descriptor).
      expect(() => {
        (LegacyAsyncMethod as any)(C.prototype.method, { kind: 'method', name: 'method' });
      }).toThrow(/@cancjs\/decorators/);

      expect(() => {
        (BabelLegacyAsyncMethod as any)(C.prototype.method, { kind: 'method', name: 'method' });
      }).toThrow(/@cancjs\/decorators/);
    });
  });

  // ============================================================================
  // Accessor / unsupported-kind handling
  // ============================================================================

  describe('decorators (ES stage-3) — unsupported kind handling', () => {
    // Real `accessor` class-field decorator syntax expects a (target: {get,set}, context) shape
    // distinct from method/field/getter decorators (TS types it as a separate overload family), so
    // exercising the runtime guard through actual decorator syntax fights the type checker for no
    // behavioral benefit. Invoking the returned decorator directly with a manufactured
    // ClassAccessorDecoratorContext-shaped object (kind: 'accessor') proves the same runtime path:
    // makeDecorator's assertSupportedKind sees the same `context.kind` a TS 5 `accessor` field
    // transform would actually pass.
    function accessorContext(name: string): any {
      return { kind: 'accessor', name, private: false, static: false, addInitializer: () => {} };
    }

    it('AsyncMethod on an `accessor` kind throws a TypeError naming the kind and supported kinds', () => {
      expect(() => {
        (AsyncMethod() as any)({ get() {}, set() {} }, accessorContext('method'));
      }).toThrow(TypeError);

      let message = '';
      try {
        (AsyncMethod() as any)({ get() {}, set() {} }, accessorContext('method'));
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/accessor/);
      expect(message).toMatch(/method, field, getter/);
    });

    it('BindMethod on an `accessor` kind throws a TypeError naming the kind and supported kinds', () => {
      let message = '';
      try {
        (BindMethod() as any)({ get() {}, set() {} }, accessorContext('method'));
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/accessor/);
      expect(message).toMatch(/method, field, getter/);
    });

    it('setter kind throws a TypeError naming the kind and supported kinds', () => {
      const setterContext: any = { kind: 'setter', name: 'method', private: false, static: false };

      let message = '';
      try {
        (AsyncMethod() as any)(function () {}, setterContext);
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/setter/);
      expect(message).toMatch(/method, field, getter/);
    });

    it('class kind throws a TypeError naming the kind and supported kinds', () => {
      const classContext: any = { kind: 'class', name: 'C' };

      let message = '';
      try {
        (AsyncMethod() as any)(class {}, classContext);
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/class/);
      expect(message).toMatch(/method, field, getter/);
    });
  });

  // ============================================================================
  // Getter returns a coroutine (new semantics)
  // ============================================================================
  //
  // The user builds the coroutine themselves with cancAsync inside the getter and returns it. The
  // decorator no longer wraps a bare generator function; it only memoizes the returned coroutine
  // per instance, and for bind:true binds it to the instance so a detached call keeps `this`.

  describe('decorators (ES stage-3) — getter returns a coroutine', () => {
    // Sentinel returned when the coroutine runs with no bound/call-site `this` (an unbound detached
    // call under bind:false — the documented unsafe edge).
    const SENTINEL = -1;

    // Shared coroutine body: reports the instance id, or the sentinel when `this` is missing.
    function* idBody(this: { id: number } | undefined): Generator<any, any, any> {
      return yield Promise.resolve(this ? this.id : SENTINEL);
    }

    // Case 1: @AsyncMethod() get m() { return cancAsync(fn, this) }
    // inst.m() resolves; a detached call still resolves because `, this` bound the coroutine.
    it('AsyncMethod with `, this` — call and detached call both resolve the instance id', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @AsyncMethod()
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

        @AsyncMethod()
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

    // Case 3: @AsyncMethod() get m() { return cancAsync(fn) } (omit `, this`).
    // A normal call carries call-site `this`; a detached call loses it (documented unsafe edge).
    it('AsyncMethod without `, this` — call-site this works, detached call loses this', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @AsyncMethod()
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

    // Case 4: @BindMethod() get m() { return cancAsync(fn) } (omit `, this`).
    // The decorator binds the coroutine to the instance, so a detached call keeps this.
    it('BindMethod without `, this` — decorator binds, detached call resolves the instance id', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @BindMethod()
        get run() {
          return cancAsync(idBody);
        }
      }

      const inst = new C(3);
      const detached = inst.run;

      expect(await detached()).toBe(3);
    });

    // Case 5: @BindMethod() get m() { return cancAsync(fn, this) }.
    // The `.bind` is a no-op over an already-bound coroutine; detached call still resolves.
    it('BindMethod with `, this` — bind is a no-op, detached call still resolves the instance id', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @BindMethod()
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
          @AsyncMethod()
          get run() {
            return 42 as any;
          }
        }

        new C().run;
      }).toThrow(TypeError);
    });

    // Case 7: cancellation. inst.m() is a CancelablePromise; cancel surfaces a CancelError through
    // try/catch; canceling inst1's call leaves inst2's independent call untouched.
    it('cancel surfaces a CancelError and does not disturb another instance', async () => {
      class C {
        @AsyncMethod()
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
}
