/**
 * Legacy-flavor audit. Same getter-preservation shape as ./decorator-types.ts assertion 1,
 * compiled under `experimentalDecorators:true` (TS legacy decorators) against
 * `@cancjs/decorators/legacy`'s `AsyncMethod`/`BindMethod` (aliases of `LegacyAsyncMethod`/
 * `LegacyBindMethod`).
 *
 * TS legacy decorators do not redefine the decorated member's static type the way stage-3
 * decorators do (the decorator return value is not type-checked against the member at all in
 * legacy mode), so the getter's own inferred return type is never erased here regardless of
 * whether the legacy decorator's factory overload declares a concrete return type or `any`.
 */
import { AsyncMethod } from '@cancjs/decorators/legacy';
import { async as cancAsync, AsyncResult } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';
import type { Expect, ExpectExtends, Not, IsAny } from './assert-type';

type Args = [id: number];
type R = string;

function* body(this: unknown, id: number): AsyncResult<R> {
 return String(id);
}

class C {
 @AsyncMethod() get m() {
 return cancAsync(body, this);
 }
}

// cancAsync's own return type is always CancelablePromise<unknown> (see ./decorator-types.ts doc
// comment); the payload here is not the decorator flavor's doing, so it is asserted as unknown.
// ExpectExtends (two-way assignability), not Equal: cancAsync's return value carries an incidental
// `displayName` property alongside the call signature (see ./decorator-types.ts doc comment).
type _MemberType = InstanceType<typeof C>['m'];
type _MemberIsCallable = Expect<ExpectExtends<_MemberType, (...a: Args) => CancelablePromise<unknown>>>;
type _MemberNotAny = Expect<Not<IsAny<_MemberType>>>;

export {};
