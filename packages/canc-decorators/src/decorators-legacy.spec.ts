import 'reflect-metadata';
import { LegacyAsyncMethod, LegacyBindMethod } from './decorators-legacy';

/**
 * TS legacy decorators matrix (`experimentalDecorators: true`).
 *
 * Same matrix as ES stage-3: 3 decorator types × 3 member types × 2 instance isolation +
 * GC assertion.
 */

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

 it('per-instance getter is bound at construction', async () => {
 class C {
 @LegacyAsyncMethod({ bind: true })
 get method() {
 return function* (this: any): Generator<any, any, any> {
 return yield Promise.resolve(this);
 };
 }
 }

 const inst = new C();
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
 new C().method;
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
const SetFnMeta = (value: string): any =>
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

 const installed = C.prototype.method as Function;
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

 const installed = C.prototype.method as Function;
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

 const installed = C.prototype.method as Function;
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

 const installed = new C().method as Function;
 expect(installed.name).toBe('original');
 expect(installed.length).toBe(2);
 });
});
