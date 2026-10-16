import 'reflect-metadata';

import { async as cancAsync } from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';

import { TAnyFn } from '../../_util';
import { BabelLegacyAsyncMethod as BabelLegacyAsync, BabelLegacyBindMethod } from './decorators-babel-legacy';
import { LegacyAsyncMethod as LegacyAsync, LegacyBindMethod } from './decorators-legacy';

/**
 * ES / TC39 stage-3 decorators matrix shared across TS and Babel test lanes.
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

// Access a property for side effect without retaining result since es5 var assignment defeats GC
function touch(_value: unknown): void {
  // intentionally empty
}

type TLegacyDecorator = (target: object, key: string, descriptor?: PropertyDescriptor) => any;

// same steps as the TypeScript __decorate helper for a member that has a descriptor
function tsLegacyDecorate(decorators: TLegacyDecorator[], target: object, key: string): void {
  let descriptor = Object.getOwnPropertyDescriptor(target, key);
  for (let i = decorators.length - 1; i >= 0; i--) {
    descriptor = decorators[i](target, key, descriptor) || descriptor;
  }
  Object.defineProperty(target, key, descriptor!);
}

// same steps as babel's _applyDecoratedDescriptor for a method or accessor
function babelLegacyDecorate(decorators: TLegacyDecorator[], target: object, key: string): void {
  const own = Object.getOwnPropertyDescriptor(target, key)!;
  const initial: PropertyDescriptor = { ...own, enumerable: !!own.enumerable, configurable: !!own.configurable };
  if ('value' in initial) {
    initial.writable = true;
  }
  const descriptor = decorators
    .slice()
    .reverse()
    .reduce<PropertyDescriptor>((current, decorator) => decorator(target, key, current) || current, initial);
  Object.defineProperty(target, key, descriptor);
}

interface ILegacyFlavor {
  name: string;
  Async: (options?: { bind?: boolean }) => TLegacyDecorator;
  Bind: (options?: { bind?: boolean }) => TLegacyDecorator;
  decorate: (decorators: TLegacyDecorator[], target: object, key: string) => void;
}

const legacyFlavors: ILegacyFlavor[] = [
  {
    name: 'TS legacy',
    Async: (options) => LegacyAsync(options),
    Bind: (options) => LegacyBindMethod(options),
    decorate: tsLegacyDecorate,
  },
  {
    name: 'babel legacy',
    Async: (options) => BabelLegacyAsync(options),
    Bind: (options) => BabelLegacyBindMethod(options),
    decorate: babelLegacyDecorate,
  },
];

// AsyncMethod/BindMethod are stage-3 (value, context); LegacyAsyncMethod/BabelLegacyAsyncMethod are
// invoked here only with manufactured wrong-shaped args (flavor mismatch guard tests), so all four
// hold decorators with incompatible call shapes and cannot share one narrower function type.
export interface IStage3MatrixDecorators {
  AsyncMethod: any;
  BindMethod: any;
  LegacyAsyncMethod: any;
  BabelLegacyAsyncMethod: any;
  // Babel 7 stage-3 plugin crashes when an undecorated field precedes a decorated field
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

  describe('decorators (ES stage-3): AsyncMethod', () => {
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
      it('bind:false: each instance calls its own method', async () => {
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

      it('bind:true: each instance has own bound method', async () => {
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
      it('instance1 released while instance2 active, instance1 collects', async () => {
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

        // Nested so inst1 is not captured by the es5 async generator and pinned across awaits.
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

  describe('decorators (ES stage-3): BindMethod', () => {
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
      it('default bind:true: each instance has own bound method', () => {
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
      it('instance1 released while instance2 active, instance1 collects', async () => {
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

        // Nested so inst1 is not captured by the es5 async generator and pinned across awaits.
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

  describe('decorators (ES stage-3): error handling', () => {
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
        // Reading the accessor is the operation under test.
        const _accessed = new C().method;
      }).toThrow(TypeError);
    });
  });

  // SetMetadata attaches metadata to method function identity via reflect-metadata
  // Decorator wrapper must copy metadata across; key-level metadata is untouched

  const FN_META = 'fn-meta-key';
  const KEY_META = 'key-meta-key';

  // Stage-3 method decorator writing metadata onto method function identity (SetMetadata style)
  function SetFnMeta(value: string) {
    return function (target: TAnyFn, _context: ClassMethodDecoratorContext): void {
      Reflect.defineMetadata(FN_META, value, target);
    };
  }

  describe('decorators (stage-3): metadata preservation', () => {
    it('fn-level metadata survives AsyncMethod (meta below canc)', () => {
      class C {
        @AsyncMethod()
        @SetFnMeta('guards')
        *method(): Generator<any, any, any> {
          return yield Promise.resolve(1);
        }
      }

      const installed = C.prototype.method as TAnyFn;
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

      const installed = C.prototype.method as TAnyFn;
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

      const installed = C.prototype.method as TAnyFn;
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
      // Named function expressions keep name/length through es5 emit (unlike class methods).
      // AsyncMethod produces a fresh coroutine wrapper, so these must be copied across.
      class C {
        @AsyncMethod({ bind: false })
        method = function* original(this: any, _a: unknown, _b: unknown): Generator<any, any, any> {
          return yield Promise.resolve(1);
        };
      }

      const installed = new C().method as TAnyFn;
      expect(installed.name).toBe('original');
      expect(installed.length).toBe(2);
    });
  });

  // Decorators are invoked with runtime shapes produced by other flavors to test guards.
  // AsyncMethod and BindMethod share makeDecorator, so one representative covers both.

  describe('decorators (ES stage-3): flavor mismatch guard', () => {
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

    it('AsyncMethod rejects TS-legacy field call shape (target, propertyKey), no descriptor', () => {
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

      // LegacyAsyncMethod applied with stage-3 args.
      expect(() => {
        (LegacyAsyncMethod as any)(C.prototype.method, { kind: 'method', name: 'method' });
      }).toThrow(/@cancjs\/decorators/);

      expect(() => {
        (BabelLegacyAsyncMethod as any)(C.prototype.method, { kind: 'method', name: 'method' });
      }).toThrow(/@cancjs\/decorators/);
    });
  });

  describe('decorators (ES stage-3): unsupported kind handling', () => {
    // Manufactured context object avoids fighting TS types for accessor keyword syntax
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

  describe('decorators (ES stage-3): getter returns a coroutine', () => {
    // Sentinel returned when the coroutine runs with no bound/call-site `this` (an unbound detached
    // call under bind:false, the documented unsafe edge).
    const SENTINEL = -1;

    // Shared coroutine body: reports the instance id, or the sentinel when `this` is missing.
    function* idBody(this: { id: number } | undefined): Generator<any, any, any> {
      return yield Promise.resolve(this ? this.id : SENTINEL);
    }

    // Case 1: @AsyncMethod() get m() { return cancAsync(fn, this) }
    // inst.m() resolves; a detached call still resolves because `, this` bound the coroutine.
    it('AsyncMethod with `, this`: call and detached call both resolve the instance id', async () => {
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
    it('AsyncMethod without `, this`: call-site this works, detached call loses this', async () => {
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

      // Detached call without bind:true leaves this undefined and returns SENTINEL
      const detached = inst.run;
      expect(await detached()).toBe(SENTINEL);
    });

    // Case 4: @BindMethod() get m() { return cancAsync(fn) } (omit `, this`).
    // The decorator binds the coroutine to the instance, so a detached call keeps this.
    it('BindMethod without `, this`: decorator binds, detached call resolves the instance id', async () => {
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
    it('BindMethod with `, this`: bind is a no-op, detached call still resolves the instance id', async () => {
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

        // Reading the accessor is the operation under test.
        const _accessed = new C().run;
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

      // inst2 is undisturbed by inst1's cancel so resolve deterministically
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

  describe('decorators (ES stage-3): receivers and overrides', () => {
    it('undecorated subclass override of a bound method runs', async () => {
      class Base {
        @BindMethod()
        name() {
          return 'base';
        }

        @AsyncMethod({ bind: true })
        *load(): Generator<any, any, any> {
          return yield Promise.resolve('base');
        }
      }

      class Derived extends Base {
        name() {
          return 'derived';
        }

        load(): any {
          return 'derived';
        }
      }

      const inst = new Derived();

      expect(inst.name()).toBe('derived');
      expect(inst.load()).toBe('derived');
    });

    it('super call through a bound method keeps the override on later calls', async () => {
      class Base {
        @BindMethod()
        name() {
          return 'base';
        }

        @AsyncMethod({ bind: true })
        *load(): Generator<any, any, any> {
          return yield Promise.resolve('base');
        }
      }

      class Derived extends Base {
        name() {
          return 'derived+' + super.name();
        }

        @AsyncMethod({ bind: true })
        *load(): Generator<any, any, any> {
          const base = yield super.load();
          return 'derived+' + base;
        }
      }

      const inst = new Derived();

      expect(inst.name()).toBe('derived+base');
      expect(inst.name()).toBe('derived+base');
      expect(await inst.load()).toBe('derived+base');
      expect(await inst.load()).toBe('derived+base');
    });

    it('super read of a memoized getter keeps the override on later reads', () => {
      class Base {
        @BindMethod()
        get fn() {
          return () => 'base';
        }
      }

      class Derived extends Base {
        // same lookup as super.fn, which es5 emit cannot express for an accessor
        get fn() {
          const base: () => string = Reflect.get(Base.prototype, 'fn', this);
          return () => 'derived+' + base();
        }
      }

      const inst = new Derived();

      expect(inst.fn()).toBe('derived+base');
      expect(inst.fn()).toBe('derived+base');
    });

    it('reading a getter through the prototype leaves instances bound to themselves', async () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @BindMethod()
        get fn() {
          return function (this: any) {
            return this.id;
          };
        }

        @AsyncMethod()
        get run() {
          return cancAsync(function* (this: any): Generator<any, any, any> {
            return yield Promise.resolve(this.id);
          }, this);
        }
      }

      class Sub extends C {}

      touch(C.prototype.fn);
      touch(C.prototype.run);
      touch(Sub.prototype.fn);

      const fn = new C(4).fn;
      const subFn = new Sub(5).fn;

      expect(fn()).toBe(4);
      expect(subFn()).toBe(5);
      expect(await new C(6).run()).toBe(6);
    });

    it('jest.spyOn on the prototype of a bound method works and restores', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        @BindMethod()
        m() {
          return this.id;
        }
      }

      const spy = jest.spyOn(C.prototype, 'm');
      let calledThroughSpy: number;
      try {
        calledThroughSpy = new C(7).m();
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }

      const detached = new C(8).m;
      expect(calledThroughSpy).toBe(7);
      expect(detached()).toBe(8);
    });

    it('both stacking orders of AsyncMethod and BindMethod produce a cancelable method', async () => {
      class AsyncOuter {
        @AsyncMethod()
        @BindMethod()
        *m(): Generator<any, any, any> {
          return yield Promise.resolve(1);
        }
      }

      class BindOuter {
        @BindMethod()
        @AsyncMethod()
        *m(): Generator<any, any, any> {
          return yield Promise.resolve(2);
        }
      }

      const first = new AsyncOuter().m() as any;
      const second = new BindOuter().m() as any;

      expect(typeof first.cancel).toBe('function');
      expect(typeof second.cancel).toBe('function');
      expect(await first).toBe(1);
      expect(await second).toBe(2);
    });

    it('bound method reached without the constructor is still wrapped', async () => {
      class C {
        @AsyncMethod({ bind: true })
        *m(): Generator<any, any, any> {
          return yield Promise.resolve(this);
        }
      }

      const hydrated = Object.create(C.prototype) as C;
      const viaCreate = hydrated.m() as any;
      const inst = new C();
      const viaProto = C.prototype.m.call(inst) as any;

      expect(typeof viaCreate.cancel).toBe('function');
      expect(typeof viaProto.cancel).toBe('function');
      expect(await viaCreate).toBe(hydrated);
      expect(await viaProto).toBe(inst);
    });

    it('setter paired with a memoized getter keeps working after a read', () => {
      class C {
        value: number;

        constructor() {
          this.value = 1;
        }

        @BindMethod()
        get fn() {
          const value = this.value;
          return () => value;
        }

        set fn(next: () => number) {
          this.value = next();
        }
      }

      const inst = new C();

      expect(inst.fn()).toBe(1);

      inst.fn = () => 2;

      expect(inst.fn()).toBe(2);
    });

    it('bound method read through a Proxy is bound to the proxy', async () => {
      class C {
        @BindMethod()
        m() {
          return this;
        }

        @AsyncMethod({ bind: true })
        *load(): Generator<any, any, any> {
          return yield Promise.resolve(this);
        }
      }

      const proxy = new Proxy(new C(), {});
      const m = proxy.m;
      const load = proxy.load;

      expect(m()).toBe(proxy);
      expect(await load()).toBe(proxy);
    });
  });

  describe.each(legacyFlavors)('decorators ($name, applied as emitted): receivers and overrides', (flavor) => {
    const { Async, Bind, decorate } = flavor;

    it('undecorated subclass override of a bound method runs', () => {
      class Base {
        name() {
          return 'base';
        }
      }
      decorate([Bind()], Base.prototype, 'name');

      class Derived extends Base {
        name() {
          return 'derived';
        }
      }

      expect(new Derived().name()).toBe('derived');
    });

    it('super call through a bound method keeps the override on later calls', async () => {
      class Base {
        name() {
          return 'base';
        }

        *load(): Generator<any, any, any> {
          return yield Promise.resolve('base');
        }
      }
      decorate([Bind()], Base.prototype, 'name');
      decorate([Async({ bind: true })], Base.prototype, 'load');

      class Derived extends Base {
        name() {
          return 'derived+' + super.name();
        }

        *load(): Generator<any, any, any> {
          const base = yield super.load();
          return 'derived+' + base;
        }
      }
      decorate([Async({ bind: true })], Derived.prototype, 'load');

      const inst = new Derived();

      expect(inst.name()).toBe('derived+base');
      expect(inst.name()).toBe('derived+base');
      expect(await inst.load()).toBe('derived+base');
      expect(await inst.load()).toBe('derived+base');
    });

    it('super read of a memoized getter keeps the override on later reads', () => {
      class Base {
        get fn() {
          return () => 'base';
        }
      }
      decorate([Bind()], Base.prototype, 'fn');

      class Derived extends Base {
        // same lookup as super.fn, which es5 emit cannot express for an accessor
        get fn() {
          const base: () => string = Reflect.get(Base.prototype, 'fn', this);
          return () => 'derived+' + base();
        }
      }

      const inst = new Derived();

      expect(inst.fn()).toBe('derived+base');
      expect(inst.fn()).toBe('derived+base');
    });

    it('reading through the prototype leaves instances bound to themselves', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        m() {
          return this.id;
        }

        get fn() {
          return function (this: any) {
            return this.id;
          };
        }
      }
      decorate([Bind()], C.prototype, 'm');
      decorate([Bind()], C.prototype, 'fn');

      class Sub extends C {}

      touch(C.prototype.m);
      touch(C.prototype.fn);
      touch(Sub.prototype.m);
      touch(Sub.prototype.fn);

      const m = new C(4).m;
      const fn = new C(5).fn;
      const subM = new Sub(6).m;
      const subFn = new Sub(7).fn;

      expect(m()).toBe(4);
      expect(fn()).toBe(5);
      expect(subM()).toBe(6);
      expect(subFn()).toBe(7);
    });

    it('jest.spyOn on the prototype of a bound method works and restores', () => {
      class C {
        id: number;

        constructor(id: number) {
          this.id = id;
        }

        m() {
          return this.id;
        }
      }
      decorate([Bind()], C.prototype, 'm');

      const spy = jest.spyOn(C.prototype, 'm');
      let calledThroughSpy: number;
      try {
        calledThroughSpy = new C(7).m();
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }

      const detached = new C(8).m;
      expect(calledThroughSpy).toBe(7);
      expect(detached()).toBe(8);
    });

    it('both stacking orders of AsyncMethod and BindMethod produce a cancelable method', async () => {
      class AsyncOuter {
        *m(): Generator<any, any, any> {
          return yield Promise.resolve(1);
        }
      }
      decorate([Async(), Bind()], AsyncOuter.prototype, 'm');

      class BindOuter {
        *m(): Generator<any, any, any> {
          return yield Promise.resolve(2);
        }
      }
      decorate([Bind(), Async()], BindOuter.prototype, 'm');

      const first = new AsyncOuter().m() as any;
      const second = new BindOuter().m() as any;

      expect(typeof first.cancel).toBe('function');
      expect(typeof second.cancel).toBe('function');
      expect(await first).toBe(1);
      expect(await second).toBe(2);
    });

    it('bound method reached without the constructor is still wrapped', async () => {
      class C {
        *m(): Generator<any, any, any> {
          return yield Promise.resolve(this);
        }
      }
      decorate([Async({ bind: true })], C.prototype, 'm');

      const hydrated = Object.create(C.prototype) as C;
      const viaCreate = hydrated.m() as any;
      const inst = new C();
      const viaProto = C.prototype.m.call(inst) as any;

      expect(typeof viaCreate.cancel).toBe('function');
      expect(typeof viaProto.cancel).toBe('function');
      expect(await viaCreate).toBe(hydrated);
      expect(await viaProto).toBe(inst);
    });

    it('setter paired with a memoized getter keeps working after a read', () => {
      class C {
        value: number;

        constructor() {
          this.value = 1;
        }

        get fn() {
          const value = this.value;
          return () => value;
        }

        set fn(next: () => number) {
          this.value = next();
        }
      }
      decorate([Bind()], C.prototype, 'fn');

      const inst = new C();

      expect(inst.fn()).toBe(1);

      inst.fn = () => 2;

      expect(inst.fn()).toBe(2);
    });

    it('bound method read through a Proxy is bound to the proxy', async () => {
      class C {
        m() {
          return this;
        }

        *load(): Generator<any, any, any> {
          return yield Promise.resolve(this);
        }
      }
      decorate([Bind()], C.prototype, 'm');
      decorate([Async({ bind: true })], C.prototype, 'load');

      const proxy = new Proxy(new C(), {});
      const m = proxy.m;
      const load = proxy.load;

      expect(m()).toBe(proxy);
      expect(await load()).toBe(proxy);
    });
  });
}
