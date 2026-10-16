// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

import { copyFunctionMetadata, isFunction, isStage3Context, TAnyFn } from '../../_util';

interface IBabelPropertyDescriptor extends PropertyDescriptor {
  initializer?: (() => any) | null;
}

interface IMethodDecoratorOptions {
  bind?: boolean;
}

function setProperty(target: any, key: string | symbol, value: any) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
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

// bound accessor getter to its prototype-level method, read by a decorator stacked on top
const boundAccessorMethods = new WeakMap<TAnyFn, TAnyFn>();

// Stage-3 decorators invoke as (value, context) where second argument is always a context object
// A babel-legacy decorator receiving that shape was applied under stage-3 compiler output
function assertBabelLegacyCallShape(propertyKey: any): void {
  if (isStage3Context(propertyKey)) {
    throw new Error(
      `This decorator is for babel legacy decorators only. It was called with stage-3 (ES / ` +
        `TC39) decorator arguments (value, context). Import from '@cancjs/decorators' for ` +
        `stage-3 decorators.`,
    );
  }
}

function makeBabelDecorator(isBind: boolean, wrap: (fn: TAnyFn, ctx: any) => TAnyFn) {
  return (target: any, propertyKey: string | symbol, descriptor: IBabelPropertyDescriptor) => {
    assertBabelLegacyCallShape(propertyKey);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- identity lookup, never called
    const stackedMethod = descriptor?.get ? boundAccessorMethods.get(descriptor.get) : undefined;
    if (stackedMethod) {
      // a bound decorator below already ran: decorate its prototype-level method, as stage-3 does
      delete descriptor.get;
      delete descriptor.set;
      descriptor.value = stackedMethod;
      descriptor.writable = true;
    }

    const isField = isFunction(descriptor?.initializer) || descriptor?.initializer === null;
    const isGetter = !!descriptor?.get;

    if (isGetter) {
      // User returns ready coroutine from getter, so decorator only memoizes per instance
      // Descriptor getter is invoked via .call(this) below
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called with .call(this) below
      const originalGetter = descriptor.get!;

      const memoizingGetter = function (this: any) {
        const raw = originalGetter.call(this);

        if (!isFunction(raw)) {
          throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
        }

        if (isPrototypeObject(this)) {
          return raw;
        }

        const value = isBind ? copyFunctionMetadata(raw, raw.bind(this)) : raw;
        if (resolvesToAccessor(this, propertyKey, memoizingGetter, undefined)) {
          setProperty(this, propertyKey, value);
        }

        return value;
      };
      descriptor.get = memoizingGetter;

      return descriptor;
    }

    if (isField) {
      const originalInitializer = descriptor.initializer;

      descriptor.initializer = function (this: any) {
        const initialValue = originalInitializer ? originalInitializer.call(this) : undefined;

        if (!isFunction(initialValue)) {
          throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
        }

        return copyFunctionMetadata(initialValue, wrap(initialValue, isBind ? this : undefined));
      };

      return descriptor;
    }

    const originalMethod = descriptor.value as TAnyFn;

    if (!isFunction(originalMethod)) {
      throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
    }

    // proto wrap once, preserving metadata attached to original method
    const protoMethod = copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));

    // a static under a stacked bound decorator stays bound whatever the outer decorator is
    if (isBind || (stackedMethod && isFunction(target))) {
      // bind:true: lazy per-instance own-bound property with per-instance isolation and GC
      delete descriptor.value;
      delete descriptor.writable;

      // a static is bound to the defining class, whichever subclass or alias it is read through
      const isStatic = isFunction(target);
      const get = function (this: any): TAnyFn {
        if (isPrototypeObject(this)) {
          return protoMethod;
        }

        const holder = isStatic ? target : this;
        const value = copyFunctionMetadata(originalMethod, wrap(originalMethod, holder));
        if (resolvesToAccessor(holder, propertyKey, get, set)) {
          setProperty(holder, propertyKey, value);
        }
        return value;
      };
      const set = function (this: any, value: any): void {
        setProperty(this, propertyKey, value);
      };
      boundAccessorMethods.set(get, protoMethod);

      descriptor.get = get;
      descriptor.set = set;
    } else {
      descriptor.value = protoMethod;
    }

    return descriptor;
  };
}

/**
 * Wraps a class method, field, or getter with a cancelable coroutine under Babel legacy decorators.
 *
 * By default (`bind: false`), wraps the method at prototype level. With `bind: true`,
 * installs a per-instance own-bound property.
 */
export function BabelLegacyAsyncMethod(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): any;
export function BabelLegacyAsyncMethod(options?: IMethodDecoratorOptions): MethodDecorator | PropertyDecorator;
export function BabelLegacyAsyncMethod(
  ...args: [IMethodDecoratorOptions?] | [any, string | symbol, PropertyDescriptor]
) {
  if (args.length > 1) {
    return (makeBabelDecorator(false, (fn, ctx) => cancAsync(fn as any, ctx)) as any)(
      ...(args as [any, string | symbol, PropertyDescriptor]),
    );
  }

  const isBind = (args[0] as IMethodDecoratorOptions | undefined)?.bind ?? false;

  return makeBabelDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx)) as any;
}

/** Same call shapes as {@link BabelLegacyAsyncMethod}; `bind:true` is the default here instead of `bind:false`. */
export function BabelLegacyBindMethod(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): any;
export function BabelLegacyBindMethod(options?: IMethodDecoratorOptions): MethodDecorator | PropertyDecorator;
export function BabelLegacyBindMethod(
  ...args: [IMethodDecoratorOptions?] | [any, string | symbol, PropertyDescriptor]
) {
  if (args.length > 1) {
    return (makeBabelDecorator(true, (fn, ctx) => (ctx !== undefined ? fn.bind(ctx) : fn)) as any)(
      ...(args as [any, string | symbol, PropertyDescriptor]),
    );
  }

  const isBind = (args[0] as IMethodDecoratorOptions | undefined)?.bind ?? true;

  return makeBabelDecorator(isBind, (fn, ctx) => (ctx !== undefined ? fn.bind(ctx) : fn)) as any;
}
