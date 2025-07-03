import { AsyncMethod, BindMethod } from './decorators';

/**
 * ES / TC39 stage-3 decorators matrix.
 *
 * Matrix: 3 decorator types (AsyncMethod/BindMethod, no param vs bind:true/false) ×
 * 3 member types (method, field, getter) × 2 instance isolation matrix (2+ instances,
 * each gets own-bound fn, no cross-instance state corruption).
 *
 * GC assertion: instance1 discarded while instance2 active; instance1 must be collectable
 * (verifies fix for prototype-based Map caching that pinned instances forever).
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

 it('getter is memoized per instance (called once)', () => {
 let callCount = 0;

 class C {
 @AsyncMethod()
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

 it('per-instance field is bound at construction', async () => {
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

 it('per-instance getter is bound at construction', async () => {
 class C {
 @AsyncMethod({ bind: true })
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

 it('field arrow fn is bound per instance', async () => {
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
