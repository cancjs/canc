import { isCancelError } from '@cancjs/promise';
import { AsyncMethod as LegacyAsyncMethod, BindMethod as LegacyBindMethod } from './legacy';
import { AsyncMethod as BabelLegacyAsyncMethod, BindMethod as BabelLegacyBindMethod } from './babel-legacy';

// Proves the `/legacy` and `/babel-legacy` subpath entries are the REAL per-toolchain decorator
// implementation, not stand-ins. Decorates a class method through each subpath's own runtime call
// shape and asserts the result is a cancelable CancelablePromise. Not a substitute for the
// per-flavor matrices; this is the subpath-entry integration check.

describe('/legacy and /babel-legacy subpath entries decorate a real method', () => {
 it('/legacy — AsyncMethod produces a cancelable CancelablePromise', async () => {
 class C {
 value: number;
 constructor(value: number) {
 this.value = value;
 }

 *run(): Generator<any, any, any> {
 return yield Promise.resolve(this.value);
 }
 }

 const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'run')!;
 (LegacyAsyncMethod() as any)(C.prototype, 'run', descriptor);
 Object.defineProperty(C.prototype, 'run', descriptor);

 const instance = new C(1);
 const promise = (instance as any).run();

 expect(typeof promise.cancel).toBe('function');

 promise.cancel();
 const reason = await promise.catch((e: any) => e);
 expect(isCancelError(reason)).toBe(true);
 });

 it('/babel-legacy — AsyncMethod produces a cancelable CancelablePromise', async () => {
 class C {
 value: number;
 constructor(value: number) {
 this.value = value;
 }

 *run(): Generator<any, any, any> {
 return yield Promise.resolve(this.value);
 }
 }

 const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'run')!;
 (BabelLegacyAsyncMethod() as any)(C.prototype, 'run', descriptor);
 Object.defineProperty(C.prototype, 'run', descriptor);

 const instance = new C(2);
 const promise = (instance as any).run();

 expect(typeof promise.cancel).toBe('function');

 promise.cancel();
 const reason = await promise.catch((e: any) => e);
 expect(isCancelError(reason)).toBe(true);
 });

 it('/legacy — BindMethod binds instance context through the subpath entry', () => {
 class C {
 value: number;
 constructor(value: number) {
 this.value = value;
 }

 getValue() {
 return this.value;
 }
 }

 const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'getValue')!;
 (LegacyBindMethod() as any)(C.prototype, 'getValue', descriptor);
 Object.defineProperty(C.prototype, 'getValue', descriptor);

 const instance = new C(3);
 const { getValue } = instance;

 expect(getValue()).toBe(3);
 });

 it('/babel-legacy — BindMethod binds instance context through the subpath entry', () => {
 class C {
 value: number;
 constructor(value: number) {
 this.value = value;
 }

 getValue() {
 return this.value;
 }
 }

 const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'getValue')!;
 BabelLegacyBindMethod(C.prototype, 'getValue', descriptor);
 Object.defineProperty(C.prototype, 'getValue', descriptor);

 const instance = new C(4);
 const { getValue } = instance;

 expect(getValue()).toBe(4);
 });
});
