import { isFunction, copyFunctionMetadata, isLegacyShapedSecondArg } from '../../_util';
// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

/**
 * ES / TC39 stage-3 decorators (native TS 5+, `experimentalDecorators: false`).
 *
 * bind:false → proto-level wrap: the decorator RETURNS the wrapped function so it replaces the
 * method on the prototype once; `this` flows through the coroutine at call time.
 * bind:true → per-instance initializer: `addInitializer` installs an own, ctx-bound property on
 * each instance (isolation guaranteed — no shared state across instances).
 *
 * Field decorators (arrow-fn class fields) receive `value === undefined` and must RETURN an
 * initializer-transformer `(initialValue) => wrapped`; they never see the fn as first arg.
 */

type TMethodDecoratorContext =
 | ClassMethodDecoratorContext
 | ClassGetterDecoratorContext
 | ClassFieldDecoratorContext;
type TMethodDecorator = (value: any, context: TMethodDecoratorContext) => any;

interface IMethodDecoratorOptions {
 bind?: boolean;
}

function setProperty(target: any, key: string | symbol, value: any) {
 Object.defineProperty(target, key, {
 value,
 writable: false,
 configurable: true,
 enumerable: false,
 });
}

function assertDecoratable(propertyKey: string | symbol, context: TMethodDecoratorContext) {
 if (context.private) {
 throw new TypeError(`'${String(propertyKey)}' is private and cannot be decorated`);
 }
}

const SUPPORTED_KINDS = ['method', 'field', 'getter'];

// Legacy (TS experimentalDecorators / babel legacy) decorators invoke as
// (target, propertyKey, descriptor?) — the second argument is the property key, a string or
// symbol. Stage-3 decorators invoke as (value, context) — the second argument is always a
// context object. A string/symbol second argument here means this decorator was applied under
// the wrong compiler flavor; fail with a message pointing at the matching entry point instead of
// crashing later on a missing `context.kind`.
function assertStage3CallShape(secondArg: any): void {
 if (isLegacyShapedSecondArg(secondArg)) {
 throw new Error(
 `This decorator is stage-3 (ES / TC39) only. It was called with legacy decorator arguments `
 + `(target, propertyKey, descriptor). Import from '@cancjs/decorators/legacy' for TS `
 + `experimentalDecorators, or '@cancjs/decorators/babel-legacy' for babel legacy decorators.`,
 );
 }
}

function assertSupportedKind(propertyKey: string | symbol, context: TMethodDecoratorContext): void {
 const kind = (context as { kind: string }).kind;
 if (!SUPPORTED_KINDS.includes(kind)) {
 throw new TypeError(
 `'${String(propertyKey)}' has unsupported decorator kind '${kind}'. `
 + `Supported kinds: ${SUPPORTED_KINDS.join(', ')}.`,
 );
 }
}

/**
 * Shared implementation. `wrap` decides whether the produced function is coroutine-wrapped
 * (`AsyncMethod`) or a plain pass-through (`BindMethod`).
 */
function makeDecorator(
 isBind: boolean,
 wrap: (fn: Function, ctx: any) => Function,
) {
 return (value: any, context: TMethodDecoratorContext): any => {
 assertStage3CallShape(context);
 const propertyKey = context.name;
 assertDecoratable(propertyKey, context);
 assertSupportedKind(propertyKey, context);

 // --- getter ---
 if (context.kind === 'getter') {
 // The user returns a ready coroutine (a cancAsync result) from the getter, so the decorator
 // never wraps it. It evaluates the getter lazily on first access, optionally binds the
 // function to the instance (bind:true), then installs an own, immutable property so the
 // result is memoized per instance (never on the prototype). Self-replacing own-property.
 const originalGetter = value as () => any;

 return function (this: any) {
 const raw = originalGetter.call(this);

 if (!isFunction(raw)) {
 throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
 }

 const result = isBind ? copyFunctionMetadata(raw, raw.bind(this)) : raw;
 setProperty(this, propertyKey, result);

 return result;
 };
 }

 // --- field (arrow-fn class field) ---
 if (context.kind === 'field') {
 // value is undefined here; return an initializer-transformer that receives the field's
 // initial value (the arrow fn) at construction time, per instance → isolation for free.
 return function (this: any, initialValue: any) {
 if (!isFunction(initialValue)) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 return copyFunctionMetadata(initialValue, wrap(initialValue, isBind ? this : undefined));
 };
 }

 // --- method ---
 if (context.kind === 'method') {
 if (!isFunction(value)) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 if (isBind) {
 // bind:true → per-instance own-bound property. Prototype method left intact.
 const originalMethod = value as Function;

 (context as ClassMethodDecoratorContext).addInitializer(function (this: any) {
 setProperty(this, propertyKey, copyFunctionMetadata(originalMethod, wrap(originalMethod, this)));
 });

 return value;
 }

 // bind:false → proto-level wrap: return the wrapped fn; `this` flows through at call time.
 return copyFunctionMetadata(value as Function, wrap(value as Function, undefined));
 }

 // Unreachable: assertSupportedKind above throws for any kind outside SUPPORTED_KINDS.
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 };
}

function isOptions(args: any[]): args is [IMethodDecoratorOptions?] {
 // Called as `@AsyncMethod` / `@AsyncMethod()` / `@AsyncMethod({ ... })` → single (or zero) arg;
 // called as raw decorator `@AsyncMethod` the runtime passes (value, context) → 2 args.
 return args.length < 2;
}

export function AsyncMethod(value: any, context: TMethodDecoratorContext): any;
export function AsyncMethod(options?: IMethodDecoratorOptions): TMethodDecorator;
export function AsyncMethod(...args: [IMethodDecoratorOptions?] | [any, TMethodDecoratorContext]) {
 if (!isOptions(args)) {
 return AsyncMethod()(...(args as [any, TMethodDecoratorContext]));
 }

 const isBind = args[0]?.bind ?? false;

 return makeDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx));
}

export function BindMethod(value: any, context: TMethodDecoratorContext): any;
export function BindMethod(options?: IMethodDecoratorOptions): TMethodDecorator;
export function BindMethod(...args: [IMethodDecoratorOptions?] | [any, TMethodDecoratorContext]) {
 if (!isOptions(args)) {
 return BindMethod()(...(args as [any, TMethodDecoratorContext]));
 }

 const isBind = args[0]?.bind ?? true;

 return makeDecorator(isBind, (fn, ctx) => (ctx !== undefined ? fn.bind(ctx) : fn));
}
