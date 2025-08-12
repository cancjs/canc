import { async as cancAsync } from '@cancjs/coroutine';
import { isCancelError } from '@cancjs/promise';
import { AsyncMethod } from './decorators';
import { LegacyAsyncMethod } from './decorators-legacy';
import { BabelLegacyAsyncMethod } from './decorators-babel-legacy';

// Proves the Style-B getter (user returns cancAsync(...) from the getter, the decorator only
// memoizes) behaves identically across all 3 decorator flavors end to end. Each flavor's decorator
// function is invoked directly with its own real runtime call shape (no compiler/transform needed
// here, the per-flavor spec files already prove the syntax compiles), so one file can exercise
// stage-3, TS-legacy and babel-legacy side by side without conflicting tsconfig/babel requirements.
// Not a substitute for the per-flavor matrices; this is the cross-flavor integration check.

function* idBody(this: { id: number } | undefined): Generator<any, any, any> {
 return yield Promise.resolve(this ? this.id : -1);
}

describe('Style-B getter across all 3 decorator flavors', () => {
 it('stage-3 — getter returns a CancelablePromise, cancel surfaces CancelError, instances isolated', async () => {
 class C {
 id: number;
 constructor(id: number) {
 this.id = id;
 }

 get run() {
 return cancAsync(idBody, this);
 }
 }

 Object.defineProperty(C.prototype, 'run', {
 ...Object.getOwnPropertyDescriptor(C.prototype, 'run'),
 get: (AsyncMethod() as any)(
 Object.getOwnPropertyDescriptor(C.prototype, 'run')!.get,
 { kind: 'getter', name: 'run', private: false, static: false, addInitializer: () => {} },
 ),
 });

 const inst1 = new C(1);
 const inst2 = new C(2);

 const promise1 = inst1.run();
 expect(typeof (promise1 as any).cancel).toBe('function');

 (promise1 as any).cancel();
 let caught: unknown;
 try {
 await promise1;
 } catch (error) {
 caught = error;
 }
 expect(isCancelError(caught)).toBe(true);

 expect(await inst2.run()).toBe(2);
 });

 it('ts-legacy — getter returns a CancelablePromise, cancel surfaces CancelError, instances isolated', async () => {
 class C {
 id: number;
 constructor(id: number) {
 this.id = id;
 }

 get run() {
 return cancAsync(idBody, this);
 }
 }

 const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'run')!;
 (LegacyAsyncMethod() as any)(C.prototype, 'run', descriptor);
 Object.defineProperty(C.prototype, 'run', descriptor);

 const inst1 = new C(10);
 const inst2 = new C(20);

 const promise1 = inst1.run();
 expect(typeof (promise1 as any).cancel).toBe('function');

 (promise1 as any).cancel();
 let caught: unknown;
 try {
 await promise1;
 } catch (error) {
 caught = error;
 }
 expect(isCancelError(caught)).toBe(true);

 expect(await inst2.run()).toBe(20);
 });

 it('babel-legacy — getter returns a CancelablePromise, cancel surfaces CancelError, instances isolated', async () => {
 class C {
 id: number;
 constructor(id: number) {
 this.id = id;
 }

 get run() {
 return cancAsync(idBody, this);
 }
 }

 const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'run')!;
 const decorated = (BabelLegacyAsyncMethod() as any)(C.prototype, 'run', descriptor);
 Object.defineProperty(C.prototype, 'run', decorated);

 const inst1 = new C(100);
 const inst2 = new C(200);

 const promise1 = inst1.run();
 expect(typeof (promise1 as any).cancel).toBe('function');

 (promise1 as any).cancel();
 let caught: unknown;
 try {
 await promise1;
 } catch (error) {
 caught = error;
 }
 expect(isCancelError(caught)).toBe(true);

 expect(await inst2.run()).toBe(200);
 });
});
