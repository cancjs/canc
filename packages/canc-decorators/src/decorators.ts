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
function makeDecorator(isBind: boolean, wrap: (fn: TAnyFn, ctx: any) => TAnyFn) {
  return (value: any, context: TMethodDecoratorContext): any => {
    assertStage3CallShape(context);
    const propertyKey = context.name;
    assertDecoratable(propertyKey, context);
    assertSupportedKind(propertyKey, context);

    if (context.kind === 'getter') {
      // User returns ready coroutine from getter, so decorator only memoizes per instance
      const originalGetter = value as () => unknown;

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

      if (isBind) {
        // bind:true: per-instance own-bound property, prototype method left intact
        const originalMethod = value as TAnyFn;

        (context as ClassMethodDecoratorContext).addInitializer(function (this: any) {
          setProperty(this, propertyKey, copyFunctionMetadata(originalMethod, wrap(originalMethod, this)));
        });

        return value;
      }

      // bind:false: proto-level wrap returning wrapped fn; this flows through at call time
      const originalMethod = value as TAnyFn;
      return copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));
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

  return makeDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx));
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
