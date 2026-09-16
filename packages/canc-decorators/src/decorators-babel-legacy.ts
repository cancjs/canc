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
    writable: false,
    configurable: true,
    enumerable: false,
  });
}

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

    const isField = isFunction(descriptor?.initializer) || descriptor?.initializer === null;
    const isGetter = !!descriptor?.get;

    if (isGetter) {
      // User returns ready coroutine from getter, so decorator only memoizes per instance
      // Descriptor getter is invoked via .call(this) below
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called with .call(this) below
      const originalGetter = descriptor.get!;

      descriptor.get = function (this: any) {
        const raw = originalGetter.call(this);

        if (!isFunction(raw)) {
          throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
        }

        const value = isBind ? copyFunctionMetadata(raw, raw.bind(this)) : raw;
        setProperty(this, propertyKey, value);

        return value;
      };

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

    if (isBind) {
      // bind:true: lazy per-instance own-bound property with per-instance isolation and GC
      delete descriptor.value;
      delete descriptor.writable;

      descriptor.get = function (this: any) {
        const value = copyFunctionMetadata(originalMethod, wrap(originalMethod, this));
        setProperty(this, propertyKey, value);
        return value;
      };
      descriptor.set = function (this: any, value: any) {
        setProperty(this, propertyKey, value);
      };
    } else {
      // bind:false: proto wrap once, preserving metadata attached to original method
      descriptor.value = copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));
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
