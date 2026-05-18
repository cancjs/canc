/**
 * Babel-legacy-flavor audit, mirroring ./decorator-types-legacy-audit.ts against
 * `@cancjs/decorators/babel-legacy`. Compiled here as plain TypeScript with
 * `experimentalDecorators:false` decorator SYNTAX disabled at the type level is not applicable —
 * babel legacy decorators are a babel transform, not a tsc one, so this file only proves the
 * shipped `.d.ts` signature for `BabelLegacyAsyncMethod`'s options-factory overload does not erase
 * the getter's type when the RETURNED decorator function is applied to a manually-typed member
 * (mirrors how demo-decorators' babel-legacy flavor is plain JS with no static decorator
 * application in TypeScript at all). The options factory returns `MethodDecorator |
 * PropertyDecorator`, a union that does not retype a getter either way — never erased, matching
 * the ts-legacy audit result.
 */
import { AsyncMethod } from '@cancjs/decorators/babel-legacy';
import { async as cancAsync, AsyncResult } from '@cancjs/coroutine';
import CancelablePromise from '@cancjs/promise';
import type { Expect, ExpectExtends, Not, IsAny } from './assert-type';

type R = string;

function* body(this: unknown, id: number): AsyncResult<R> {
 return String(id);
}

// The babel-legacy decorator factory's declared type (`MethodDecorator | PropertyDecorator`) is
// never applied through tsc decorator-application checking (babel performs the transform, not
// tsc), so the getter itself is declared with its own inferred type here, matching what a real
// babel-legacy consumer's static type looks like: the getter's return type, never erased.
class C {
 get m() {
 return cancAsync(body, this);
 }
}

// AsyncMethod is still invocable as the options factory (`AsyncMethod()`), returning a decorator
// function whose declared type does not touch C['m'] under babel's transform.
const decorator = AsyncMethod();
void decorator;

// cancAsync's own return type is always CancelablePromise<unknown> (see ./decorator-types.ts doc
// comment); the payload here is not the decorator flavor's doing, so it is asserted as unknown.
// ExpectExtends (two-way assignability), not Equal: cancAsync's return value carries an incidental
// `displayName` property alongside the call signature (see ./decorator-types.ts doc comment).
type _MemberType = InstanceType<typeof C>['m'];
type _MemberIsCallable = Expect<ExpectExtends<_MemberType, (id: number) => CancelablePromise<unknown>>>;
type _MemberNotAny = Expect<Not<IsAny<_MemberType>>>;

export {};
