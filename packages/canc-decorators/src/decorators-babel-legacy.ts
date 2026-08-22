// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

import { copyFunctionMetadata, isFunction, isStage3Context, TAnyFn } from '../../_util';

/**
 * Babel legacy decorators (`@babel/plugin-proposal-decorators` with `legacy: true` +
 * `@babel/plugin-proposal-class-properties` / `loose`). Runtime shape mirrors TS-legacy for
 * methods and getters, `(target=prototype, propertyKey, descriptor)`, but class FIELDS are
 * always given a descriptor carrying `initializer` (a function producing the field's initial
 * value) instead of `value`. That `initializer` is the hook TS-legacy lacks; we rewrite it so
 * the wrapped/bound function is produced per instance at construction.
 *
 * Policy identical to the other flavors:
 * bind:false: proto-level wrap (methods) / initializer wraps value with no ctx (fields).
 * bind:true: per-instance own-bound property (lazy accessor for methods; initializer for
 * fields, both run per instance, no shared cross-instance state).
 */

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
      // eslint-disable-next-line @typescript-eslint/unbound-method
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

// Babel legacy decorator return value never redefines the decorated member's own type (same as TS
// legacy), so the `any` positions below do not erase anything at the call site; no
// identity-preserving overloads needed here.
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
