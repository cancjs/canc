import { isFunction, copyFunctionMetadata, isStage3Context, isBabelLegacyDescriptor } from '../../_util';
// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

/**
 * TS legacy decorators (`experimentalDecorators: true`). Runtime shape:
 * method/getter → (target=prototype, propertyKey, descriptor)
 * field/prop → (target=prototype, propertyKey) [no descriptor]
 *
 * bind:false → proto-level wrap (rewrite descriptor.value once on the prototype).
 * bind:true → per-instance: a lazy accessor that, on first read, installs an own, ctx-bound
 * immutable property on the INSTANCE (self-replacing own-property). The previous
 * implementation cached bound methods in a Map stored on the prototype keyed by
 * property name — the first instance's bound method leaked to every other instance
 * and pinned the first instance forever. Per-instance own-property fixes both.
 */

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

/**
 * Install a lazy, per-instance accessor on the PROTOTYPE. On first read from any instance it
 * computes `produce(this)` and defines it as an own, immutable property on that instance, which
 * then shadows this prototype accessor for that instance only. No shared cross-instance state,
 * and once an instance is discarded nothing pins it (contrast: prototype Map).
 */
function definePerInstanceAccessor(
 target: any,
 propertyKey: string | symbol,
 produce: (self: any) => Function,
) {
 Object.defineProperty(target, propertyKey, {
 configurable: true,
 enumerable: false,
 get(this: any) {
 const value = produce(this);
 setProperty(this, propertyKey, value);
 return value;
 },
 set(this: any, value: any) {
 // Allow subclasses / manual assignment to override, matching a normal own field.
 setProperty(this, propertyKey, value);
 },
 });
}

// Stage-3 decorators invoke as (value, context) — the second argument is always a context
// object carrying `kind`. A TS-legacy decorator receiving that shape means it was applied under
// `experimentalDecorators: false` (stage-3 compiler output); fail with a message pointing at the
// stage-3 entry point instead of crashing on `propertyKey` being an object.
function assertLegacyCallShape(propertyKey: any): void {
 if (isStage3Context(propertyKey)) {
 throw new Error(
 `This decorator is for TS legacy decorators ('experimentalDecorators: true') only. It was `
 + `called with stage-3 (ES / TC39) decorator arguments (value, context). Import from `
 + `'@cancjs/decorators' for stage-3 decorators.`,
 );
 }
}

// Babel-legacy descriptors always carry an `initializer` key (methods/getters get a real
// descriptor without it; fields get one set to a function or explicit null). TS-legacy never
// produces that shape — its field calls omit the descriptor entirely. Seeing it here means this
// decorator was applied under babel's legacy decorator transform instead of TS's.
function assertNotBabelLegacyDescriptor(descriptor: any): void {
 if (isBabelLegacyDescriptor(descriptor)) {
 throw new Error(
 `This decorator is for TS legacy decorators ('experimentalDecorators: true') only. It was `
 + `called with a babel-legacy-shaped descriptor. Import from `
 + `'@cancjs/decorators/babel-legacy' for babel legacy decorators.`,
 );
 }
}

function makeLegacyDecorator(
 isBind: boolean,
 wrap: (fn: Function, ctx: any) => Function,
) {
 return (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) => {
 assertLegacyCallShape(propertyKey);
 assertNotBabelLegacyDescriptor(descriptor);

 const isProtoMethod = !!descriptor && !descriptor.get;
 const isGetter = !!descriptor && !!descriptor.get;

 // --- getter ---
 if (isGetter) {
 const originalGetter = descriptor!.get!;

 descriptor!.get = function (this: any) {
 const raw = originalGetter.call(this);

 if (!isFunction(raw)) {
 throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
 }

 const value = copyFunctionMetadata(raw, wrap(raw, isBind ? this : undefined));
 // Memoize per instance (own-property shadows this accessor for this instance only).
 setProperty(this, propertyKey, value);

 return value;
 };

 return;
 }

 // --- proto method ---
 if (isProtoMethod) {
 const originalMethod = descriptor!.value as Function;

 if (!isFunction(originalMethod)) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 if (isBind) {
 // bind:true → lazy per-instance own-bound property.
 delete descriptor!.value;
 delete (descriptor as any).writable;
 definePerInstanceAccessor(target, propertyKey, (self) =>
 copyFunctionMetadata(originalMethod, wrap(originalMethod, self)),
 );
 } else {
 // bind:false → proto wrap once. Preserve metadata another decorator attached to the
 // original method function (SetMetadata-style), otherwise it is lost on the wrapper.
 descriptor!.value = copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));
 }

 return;
 }

 // --- field / property (no descriptor) ---
 // The initial value is not observable here in the TS-legacy runtime; install a lazy accessor
 // that wraps the field's initial value on first read. Because class-field initializers run in
 // the constructor and assign via [[Set]], our accessor's setter captures that initial value
 // and re-installs the wrapped own-property per instance.
 definePerInstanceFieldAccessor(target, propertyKey, isBind, wrap);
 };
}

/**
 * Field path: the accessor's setter receives the field's initial value at construction, wraps it,
 * and defines a per-instance own-property. Reads before assignment yield undefined (matches an
 * uninitialized field).
 */
function definePerInstanceFieldAccessor(
 target: any,
 propertyKey: string | symbol,
 isBind: boolean,
 wrap: (fn: Function, ctx: any) => Function,
) {
 Object.defineProperty(target, propertyKey, {
 configurable: true,
 enumerable: true,
 get() {
 return undefined;
 },
 set(this: any, initialValue: any) {
 if (!isFunction(initialValue)) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 setProperty(
 this,
 propertyKey,
 copyFunctionMetadata(initialValue, wrap(initialValue, isBind ? this : undefined)),
 );
 },
 });
}

// Return type `any` on the factory overload is deliberate: a `MethodDecorator | PropertyDecorator`
// union is not resolvable in a legacy decorator position (TS rejects it with "unable to resolve
// signature"), and the same decorator must be usable on methods, getters and fields alike. `any`
// lets the single runtime decorator apply in every member position.
export function LegacyAsyncMethod(target: any, propertyKey: string | symbol): void;
export function LegacyAsyncMethod(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void;
export function LegacyAsyncMethod(options?: IMethodDecoratorOptions): any;
export function LegacyAsyncMethod(
 ...args: [IMethodDecoratorOptions?] | [any, string | symbol] | [any, string | symbol, PropertyDescriptor]
) {
 if (args.length > 1) {
 return LegacyAsyncMethod()(...(args as [any, string, PropertyDescriptor]));
 }

 const isBind = (args[0] as IMethodDecoratorOptions | undefined)?.bind ?? false;

 return makeLegacyDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx));
}

export function LegacyBindMethod(target: any, propertyKey: string | symbol): void;
export function LegacyBindMethod(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void;
export function LegacyBindMethod(options?: IMethodDecoratorOptions): any;
export function LegacyBindMethod(
 ...args: [IMethodDecoratorOptions?] | [any, string | symbol] | [any, string | symbol, PropertyDescriptor]
) {
 if (args.length > 1) {
 return LegacyBindMethod()(...(args as [any, string, PropertyDescriptor]));
 }

 const isBind = (args[0] as IMethodDecoratorOptions | undefined)?.bind ?? true;

 return makeLegacyDecorator(isBind, (fn, ctx) => (ctx !== undefined ? fn.bind(ctx) : fn));
}
