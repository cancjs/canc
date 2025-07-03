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
