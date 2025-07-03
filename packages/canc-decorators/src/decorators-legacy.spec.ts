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

describe('decorators (TS legacy) — LegacyAsyncMethod', () => {
 describe('bind:false (default)', () => {
 it('proto method wraps at decoration time', async () => {
 class C {
 @LegacyAsyncMethod()
 *method() {
 yield Promise.resolve(42);
 }
 }

 const inst = new C();
 const result = await inst.method();

 expect(result).toBe(42);
 });

 it('field arrow fn returns wrapped initializer', async () => {
 class C {
 @LegacyAsyncMethod()
 method = async function* (this: any) {
 yield Promise.resolve(99);
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
 *method() {
 yield Promise.resolve(this.id);
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
 *method() {
 yield Promise.resolve(this);
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
 method = async function* (this: any) {
 yield Promise.resolve(this.id);
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
 return function* (this: any) {
 yield Promise.resolve(this);
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
 *method() {
 yield Promise.resolve(this.id);
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

 {
 const inst1 = new (class {
 @LegacyAsyncMethod({ bind: true })
 *method() {
 yield Promise.resolve(42);
 }
 })();

 const _ = inst1.method;

 const registry = new FinalizationRegistry(() => {
 finalized.push(true);
 });
 registry.register(inst1, 'instance1');
 }

 const inst2 = new (class {
 @LegacyAsyncMethod({ bind: true })
 *method() {
 yield Promise.resolve(99);
 }
 })();

 const _ = inst2.method;

 gc();
 await delay(10);

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

 {
 const inst1 = new (class {
 @LegacyBindMethod()
 method() {
 return 42;
 }
 })();

 const _ = inst1.method;

 const registry = new FinalizationRegistry(() => {
 finalized.push(true);
 });
 registry.register(inst1, 'instance1');
 }

 const inst2 = new (class {
 @LegacyBindMethod()
 method() {
 return 99;
 }
 })();

 const _ = inst2.method;

 gc();
 await delay(10);

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
