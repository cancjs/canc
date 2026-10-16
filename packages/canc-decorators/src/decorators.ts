// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

import { copyFunctionMetadata, isFunction, isLegacyShapedSecondArg, TAnyFn } from '../../_util';

type TMethodDecoratorContext = ClassMethodDecoratorContext | ClassGetterDecoratorContext | ClassFieldDecoratorContext;

interface IMethodDecoratorOptions {
  bind?: boolean;
}

interface IMemberDecorator {
  <This, Value>(value: (this: This) => Value, context: ClassGetterDecoratorContext<This, Value>): (this: This) => Value;
  <This, Fn extends (...a: any[]) => any>(value: Fn, context: ClassMethodDecoratorContext<This, Fn>): Fn;
  <This, Value>(value: undefined, context: ClassFieldDecoratorContext<This, Value>): (this: This, init: Value) => Value;
}

function setProperty(target: any, key: string | symbol, value: any) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// a generator object has next/throw/return, which no coroutine promise exposes
function isGeneratorObject(value: any): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    isFunction(value.next) &&
    isFunction(value.throw) &&
    isFunction(value.return)
  );
}

// the getter must hand back a coroutine, so a call that yields a generator object is misuse
function guardGeneratorResult(fn: TAnyFn, propertyKey: string | symbol): TAnyFn {
  const guarded = function (this: any, ...rest: any[]) {
    const result = fn.apply(this, rest);
    if (isGeneratorObject(result)) {
      throw new TypeError(
        `'${String(propertyKey)}' getter returned a generator function that was not wrapped. ` +
          `Return cancAsync(function* () { ... }) from the getter instead.`,
      );
    }
    return result;
  };

  return copyFunctionMetadata(fn, guarded);
}

// a class prototype (spyOn, reflection, a subclass prototype) is shared by every instance
function isPrototypeObject(target: any): boolean {
  return (
    Object.prototype.hasOwnProperty.call(target, 'constructor') &&
    isFunction(target.constructor) &&
    target.constructor.prototype === target
  );
}

// memo only while receiver[key] still lands here, so overrides and paired setters survive
function resolvesToAccessor(receiver: any, key: string | symbol, get: TAnyFn, set: TAnyFn | undefined): boolean {
  for (let current = receiver; current !== null && current !== undefined; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      return descriptor.get === get && descriptor.set === set;
    }
  }
  return false;
}

// binds on first read rather than at construction, so a Proxy receiver gets a proxy-bound function
function makeBoundAccessor(key: string | symbol, produce: (self: any) => TAnyFn): PropertyDescriptor {
  const get = function (this: any): TAnyFn {
    const value = produce(this);
    if (resolvesToAccessor(this, key, get, set)) {
      setProperty(this, key, value);
    }
    return value;
  };
  const set = function (this: any, value: any): void {
    setProperty(this, key, value);
  };

  return { get, set, configurable: true, enumerable: false };
}

function assertDecoratable(propertyKey: string | symbol, context: TMethodDecoratorContext) {
  if (context.private) {
    throw new TypeError(`'${String(propertyKey)}' is private and cannot be decorated`);
  }
}

const SUPPORTED_KINDS = ['method', 'field', 'getter'];

// Legacy decorators invoke as (target, propertyKey, descriptor?) with key as second arg
// Stage-3 decorators invoke as (value, context) with context object as second arg
// Non-context second arg means decorator was applied under the wrong compiler flavor
function assertStage3CallShape(secondArg: any): void {
  if (isLegacyShapedSecondArg(secondArg)) {
    throw new Error(
      `This decorator is stage-3 (ES / TC39) only. It was called with legacy decorator arguments ` +
        `(target, propertyKey, descriptor). Import from '@cancjs/decorators/legacy' for TS ` +
        `experimentalDecorators, or '@cancjs/decorators/babel-legacy' for babel legacy decorators.`,
    );
  }
}

function assertSupportedKind(propertyKey: string | symbol, context: TMethodDecoratorContext): void {
  const kind = (context as { kind: string }).kind;
  if (!SUPPORTED_KINDS.includes(kind)) {
    throw new TypeError(
      `'${String(propertyKey)}' has unsupported decorator kind '${kind}'. ` +
        `Supported kinds: ${SUPPORTED_KINDS.join(', ')}.`,
    );
  }
}

/**
 * Shared implementation. `wrap` decides whether the produced function is coroutine-wrapped
 * (`AsyncMethod`) or a plain pass-through (`BindMethod`).
 */
function makeDecorator(isBind: boolean, wrap: (fn: TAnyFn, ctx: any) => TAnyFn, isAsync = false) {
  return (value: any, context: TMethodDecoratorContext): any => {
    assertStage3CallShape(context);
    const propertyKey = context.name;
    assertDecoratable(propertyKey, context);
    assertSupportedKind(propertyKey, context);

    if (context.kind === 'getter') {
      // User returns ready coroutine from getter, so decorator only memoizes per instance
      const originalGetter = value as () => unknown;

      const memoizingGetter = function (this: any) {
        const raw = originalGetter.call(this);

        if (!isFunction(raw)) {
          throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
        }

        if (isPrototypeObject(this)) {
          return raw;
        }

        const guarded = isAsync ? guardGeneratorResult(raw, propertyKey) : raw;
        const result = isBind ? copyFunctionMetadata(guarded, guarded.bind(this)) : guarded;
        if (resolvesToAccessor(this, propertyKey, memoizingGetter, undefined)) {
          setProperty(this, propertyKey, result);
        }

        return result;
      };

      return memoizingGetter;
    }

    if (context.kind === 'field') {
      // Initial value received at construction time per instance gives isolation for free
      return function (this: any, initialValue: any) {
        if (!isFunction(initialValue)) {
          throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
        }

        return copyFunctionMetadata(initialValue, wrap(initialValue, isBind ? this : undefined));
      };
    }

    if (context.kind === 'method') {
      if (!isFunction(value)) {
        throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
      }

      const originalMethod = value as TAnyFn;
      // prototype slot is wrapped for every placement, so Object.create and super calls see it
      const protoMethod = copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));

      if (isBind) {
        const produce = (self: any) => copyFunctionMetadata(originalMethod, wrap(originalMethod, self));
        const boundAccessor = makeBoundAccessor(propertyKey, produce);

        (context as ClassMethodDecoratorContext).addInitializer(function (this: any) {
          if (context.static) {
            // this is the defining class here, so an outer decorator's result is bound to it too
            const slot = this[propertyKey];
            if (isFunction(slot)) {
              const bound = slot === protoMethod ? produce(this) : copyFunctionMetadata(slot, slot.bind(this));
              setProperty(this, propertyKey, bound);
            }
            return;
          }

          // an override or an outer decorator owns the slot, binding this one would hide it
          if (this[propertyKey] === protoMethod) {
            Object.defineProperty(this, propertyKey, boundAccessor);
          }
        });
      }

      return protoMethod;
    }

    // Unreachable: assertSupportedKind above throws for any kind outside SUPPORTED_KINDS.
    throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
  };
}

function isOptions(args: any[]): args is [IMethodDecoratorOptions?] {
  // Single or zero args when called as decorator factory; two args when called raw at runtime
  return args.length < 2;
}

/**
 * Wraps a class method, field, or getter with a cancelable coroutine.
 *
 * By default (`bind: false`), wraps the method at prototype level. With `bind: true`,
 * installs an own-bound property on each instance.
 */
export function AsyncMethod<This, Value>(
  value: (this: This) => Value,
  context: ClassGetterDecoratorContext<This, Value>,
): (this: This) => Value;
export function AsyncMethod<This, Fn extends (...a: any[]) => any>(
  value: Fn,
  context: ClassMethodDecoratorContext<This, Fn>,
): Fn;
export function AsyncMethod<This, Value>(
  value: undefined,
  context: ClassFieldDecoratorContext<This, Value>,
): (this: This, init: Value) => Value;
export function AsyncMethod(options?: IMethodDecoratorOptions): IMemberDecorator;
export function AsyncMethod(...args: any[]): any {
  if (!isOptions(args)) {
    // narrowing it would break the public call shapes so args are re-dispatched unchanged

    return (AsyncMethod() as (...a: any[]) => any)(...args);
  }

  const isBind = args[0]?.bind ?? false;

  return makeDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx), true);
}

/** Same call shapes as {@link AsyncMethod}; `bind:true` is the default here instead of `bind:false`. */
export function BindMethod<This, Value>(
  value: (this: This) => Value,
  context: ClassGetterDecoratorContext<This, Value>,
): (this: This) => Value;
export function BindMethod<This, Fn extends (...a: any[]) => any>(
  value: Fn,
  context: ClassMethodDecoratorContext<This, Fn>,
): Fn;
export function BindMethod<This, Value>(
  value: undefined,
  context: ClassFieldDecoratorContext<This, Value>,
): (this: This, init: Value) => Value;
export function BindMethod(options?: IMethodDecoratorOptions): IMemberDecorator;
export function BindMethod(...args: any[]): any {
  if (!isOptions(args)) {
    // narrowing it would break the public call shapes so args are re-dispatched unchanged

    return (BindMethod() as (...a: any[]) => any)(...args);
  }

  const isBind = args[0]?.bind ?? true;

  return makeDecorator(isBind, (fn, ctx) => (ctx !== undefined ? fn.bind(ctx) : fn));
}
