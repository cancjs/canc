/**
 * Decorator member-type-preservation assertions. Compiled only in the matrix's stage-3 decorator
 * lanes (matrix.config.json → version with `decoratorTypes:true`, materialised with
 * `experimentalDecorators:false`): TC39 stage-3 decorator syntax needs TS 5.0+, so this file is
 * excluded from the 4.2/4.7 lanes (see run-matrix.mjs `writeDecoratorFixture`).
 *
 * Assertions 1-4 are positive proof of the current shipped types: getter/method/field members
 * keep their own inferred or declared type through decoration, and the erasure-detecting checks
 * (`Not<IsAny<...>>`) are hard `tsc` gates against any future regression.
 *
 * TypeScript does NOT retype a decorated getter/method/field member just because the decorator
 * FACTORY's declared return type is `any`: a decorator whose factory overload returns
 * `(value, ctx) => any` still leaves the member typed as its own inferred/declared type, on every
 * TS version from 5.0 through latest. The `unknown` payload seen on every decorated getter
 * (assertion 1/3) is unrelated to decorator typing: it comes from `cancAsync`'s own return type
 * (`CancelablePromise<unknown>` always -- its generator's declared return value is never threaded
 * into the constructed promise), so a getter that returns `cancAsync(...)` needs an external cast
 * to satisfy a concretely-typed interface for that reason, not because of decorator erasure.
 *
 * The place an `any`-vs-typed difference IS directly observable is the decorator's OWN applied
 * call return (`_DecoratorAppliedNotAny` below): calling the value the factory returns, with
 * `(value, context)`, types as `any` for an `any`-returning factory and as the per-kind identity
 * signature for a generic, identity-preserving one.
 *
 * Member-callable checks use `ExpectExtends` (two-way assignability) rather than the invariant
 * `Equal`: `cancAsync`'s return value carries an incidental `displayName` property alongside the
 * call signature, so an exact structural `Equal` against a bare arrow-function type is the wrong
 * tool here.
 */
import { AsyncMethod, BindMethod } from '@cancjs/decorators';
import { async as cancAsync, AsyncResult } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';
import type { Equal, Expect, ExpectExtends, IsAny, Not } from './assert-type';

type Args = [id: number];
type R = string;

function* body(this: unknown, id: number): AsyncResult<R> {
 return String(id);
}

// ============================================================ 1. getter preserved
class C {
 @AsyncMethod() get m() {
 return cancAsync(body, this);
 }
}

type _MemberType = InstanceType<typeof C>['m'];
type _MemberIsCallable = Expect<ExpectExtends<_MemberType, (...a: Args) => CancelablePromise<unknown>>>;
type _MemberNotAny = Expect<Not<IsAny<_MemberType>>>;

declare const instance: InstanceType<typeof C>;
const awaited = instance.m(1);
type _AwaitedIsUnknown = Expect<Equal<Awaited<typeof awaited>, unknown>>;

// ============================================================ 1b. decorator-applied-result gate
// The decorator factory's return value, applied with the real (value, context) call shape a
// stage-3 transform passes: erases to `any` if the factory's overloads return `any`, resolves to
// the per-kind identity signature if they are generic and identity-preserving.
type _DecoratorInstance = ReturnType<typeof AsyncMethod>;
type _DecoratorAppliedResult = ReturnType<_DecoratorInstance>;
type _DecoratorAppliedNotAny = Expect<Not<IsAny<_DecoratorAppliedResult>>>;

// ============================================================ 2. structural satisfy (no cast)
// IShape's method returns a plain Promise of unknown: cancAsync's own return type, not the
// decorator, sets the payload. The getter's inferred type survives decoration unchanged (assertion
// 1), so C structurally satisfies IShape from the outside with no cast.
interface IShape {
 m(...a: Args): Promise<unknown>;
}

const c: IShape = new C();
void c;

// ============================================================ 3. @BindMethod() getter — same shape
class CBind {
 @BindMethod() get m() {
 return cancAsync(body, this);
 }
}

type _BindMemberType = InstanceType<typeof CBind>['m'];
type _BindMemberIsCallable = Expect<ExpectExtends<_BindMemberType, (...a: Args) => CancelablePromise<unknown>>>;
const cBind: IShape = new CBind();
void cBind;

// ============================================================ 4. method identity (Style A limit)
// A method decorator's return must be assignable to the ORIGINAL method type (TS1270), so a
// generator method stays generator-typed after decoration — it is NOT retyped to a
// CancelablePromise-returning method, and it is NOT erased to `any` either. This documents Style
// A's cast tax: callers still need a manual cast to consume it as a promise-returning method.
class CMethod {
 @AsyncMethod() *m(id: number): AsyncResult<R> {
 return String(id);
 }
}

type _MethodMemberType = InstanceType<typeof CMethod>['m'];
type _MethodStaysGenerator = Expect<Equal<_MethodMemberType, (id: number) => AsyncResult<R>>>;
type _MethodNotAny = Expect<Not<IsAny<_MethodMemberType>>>;

export {};
