// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

import { copyFunctionMetadata, isFunction, isLegacyShapedSecondArg, TAnyFn } from '../../_util';

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

// Legacy (TS experimentalDecorators / babel legacy) decorators invoke as
// (target, propertyKey, descriptor?) — the second argument is the property key, a string or
// symbol. Stage-3 decorators invoke as (value, context) — the second argument is always a
// context object. A string/symbol second argument here means this decorator was applied under
// the wrong compiler flavor; fail with a message pointing at the matching entry point instead of
// crashing later on a missing `context.kind`.
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

    // --- getter ---
    if (context.kind === 'getter') {
      // The user returns a ready coroutine (a cancAsync result) from the getter, so the decorator
      // never wraps it. It evaluates the getter lazily on first access, optionally binds the
      // function to the instance (bind:true), then installs an own, immutable property so the
      // result is memoized per instance (never on the prototype). Self-replacing own-property.
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
        const originalMethod = value as TAnyFn;

        (context as ClassMethodDecoratorContext).addInitializer(function (this: any) {
          setProperty(this, propertyKey, copyFunctionMetadata(originalMethod, wrap(originalMethod, this)));
        });

        return value;
      }

      // bind:false → proto-level wrap: return the wrapped fn; `this` flows through at call time.
      const originalMethod = value as TAnyFn;
      return copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));
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

// Stage-3 decorator return types redefine the decorated member's type. Returning `any` here would
// erase every decorated getter/method to `any`/`unknown` at the call site, so these overloads stay
// generic and identity-preserving: the member's own declared type survives decoration.
//
// A getter's inferred return type is kept, so a getter that returns `cancAsync(...)` needs no cast.
// A method decorator's return must be assignable to the original method type, so a generator method
// cannot be retyped to a promise-returning one (TypeScript error TS1270). Method style therefore
// stays type-wrong in TypeScript (use it only in plain JavaScript); getter and field styles are
// exact. Background: https://github.com/microsoft/TypeScript/issues/4881
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
    // Implementation signature must stay `(...args: any[]): any` to host every overload above;
    // narrowing it would break the public call shapes. Safe: args is re-dispatched unchanged.

    return (AsyncMethod() as (...a: any[]) => any)(...args);
  }

  const isBind = args[0]?.bind ?? false;

  return makeDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx));
}

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
    // Implementation signature must stay `(...args: any[]): any` to host every overload above;
    // narrowing it would break the public call shapes. Safe: args is re-dispatched unchanged.

    return (BindMethod() as (...a: any[]) => any)(...args);
  }

  const isBind = args[0]?.bind ?? true;

  return makeDecorator(isBind, (fn, ctx) => (ctx !== undefined ? fn.bind(ctx) : fn));
}
