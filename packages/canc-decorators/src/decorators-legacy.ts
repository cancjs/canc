// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

import { copyFunctionMetadata, isBabelLegacyDescriptor, isFunction, isStage3Context, TAnyFn } from '../../_util';

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
function definePerInstanceAccessor(target: any, propertyKey: string | symbol, produce: (self: any) => TAnyFn) {
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

// Stage-3 decorators invoke as (value, context) where second argument is always a context object
// A TS-legacy decorator receiving that shape was applied under experimentalDecorators: false
function assertLegacyCallShape(propertyKey: any): void {
  if (isStage3Context(propertyKey)) {
    throw new Error(
      `This decorator is for TS legacy decorators ('experimentalDecorators: true') only. It was ` +
        `called with stage-3 (ES / TC39) decorator arguments (value, context). Import from ` +
        `'@cancjs/decorators' for stage-3 decorators.`,
    );
  }
}

// Babel-legacy descriptors carry an initializer key; TS-legacy field calls omit descriptor entirely
// Seeing an initializer key here means decorator was applied under babel legacy transform
function assertNotBabelLegacyDescriptor(descriptor: any): void {
  if (isBabelLegacyDescriptor(descriptor)) {
    throw new Error(
      `This decorator is for TS legacy decorators ('experimentalDecorators: true') only. It was ` +
        `called with a babel-legacy-shaped descriptor. Import from ` +
        `'@cancjs/decorators/babel-legacy' for babel legacy decorators.`,
    );
  }
}

function makeLegacyDecorator(isBind: boolean, wrap: (fn: TAnyFn, ctx: any) => TAnyFn) {
  return (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) => {
    assertLegacyCallShape(propertyKey);
    assertNotBabelLegacyDescriptor(descriptor);

    const isProtoMethod = !!descriptor && !descriptor.get;
    const isGetter = !!descriptor && !!descriptor.get;

    if (isGetter) {
      // User returns ready coroutine from getter, so decorator only memoizes per instance
      // Descriptor getter is invoked via .call(this) below
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalGetter = descriptor!.get!;

      descriptor!.get = function (this: any) {
        const raw = originalGetter.call(this);

        if (!isFunction(raw)) {
          throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
        }

        const value = isBind ? copyFunctionMetadata(raw, raw.bind(this)) : raw;
        // Memoize per instance (own-property shadows this accessor for this instance only).
        setProperty(this, propertyKey, value);

        return value;
      };

      return;
    }

    if (isProtoMethod) {
      const originalMethod = descriptor!.value as TAnyFn;

      if (!isFunction(originalMethod)) {
        throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
      }

      if (isBind) {
        // bind:true: lazy per-instance own-bound property
        delete descriptor!.value;
        delete (descriptor as any).writable;
        definePerInstanceAccessor(target, propertyKey, (self) =>
          copyFunctionMetadata(originalMethod, wrap(originalMethod, self)),
        );
      } else {
        // bind:false: proto wrap once, preserving metadata attached to original method
        descriptor!.value = copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));
      }

      return;
    }

    // Field initial value is assigned via [[Set]] in constructor and captured by setter
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
  wrap: (fn: TAnyFn, ctx: any) => TAnyFn,
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

      setProperty(this, propertyKey, copyFunctionMetadata(initialValue, wrap(initialValue, isBind ? this : undefined)));
    },
  });
}

/**
 * Wraps a class method, field, or getter with a cancelable coroutine under TypeScript legacy decorators.
 *
 * By default (`bind: false`), wraps the method at prototype level. With `bind: true`,
 * installs a lazy per-instance own-bound property on first access.
 */
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

/** Same call shapes as {@link LegacyAsyncMethod}; `bind:true` is the default here instead of `bind:false`. */
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
