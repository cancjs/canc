// cancAsync moved from @cancjs/promise to @cancjs/coroutine.
import { async as cancAsync } from '@cancjs/coroutine';

import { copyFunctionMetadata, isBabelLegacyDescriptor, isFunction, isStage3Context, TAnyFn } from '../../_util';

interface IMethodDecoratorOptions {
  bind?: boolean;
}

function setProperty(target: any, key: string | symbol, value: any, enumerable = false) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable,
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

// bound accessor getter to its prototype-level method, read by a decorator stacked on top
const boundAccessorMethods = new WeakMap<TAnyFn, TAnyFn>();

/**
 * Install a lazy, per-instance accessor on the PROTOTYPE. On first read from an instance it
 * computes `produce(this)` and defines it as an own, immutable property on that instance, which
 * then shadows this prototype accessor for that instance only. No shared cross-instance state,
 * and once an instance is discarded nothing pins it (contrast: prototype Map). A read through a
 * prototype returns `protoMethod` and caches nothing.
 */
function definePerInstanceAccessor(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
  protoMethod: TAnyFn,
  produce: (self: any) => TAnyFn,
) {
  // a static is bound to the defining class, whichever subclass or alias it is read through
  const isStatic = isFunction(target);
  const get = function (this: any): TAnyFn {
    if (isPrototypeObject(this)) {
      return protoMethod;
    }

    const holder = isStatic ? target : this;
    const value = produce(holder);
    if (resolvesToAccessor(holder, propertyKey, get, set)) {
      setProperty(holder, propertyKey, value);
    }
    return value;
  };
  const set = function (this: any, value: any): void {
    // Allow subclasses / manual assignment to override, matching a normal own field.
    setProperty(this, propertyKey, value);
  };
  boundAccessorMethods.set(get, protoMethod);

  delete descriptor.value;
  delete descriptor.writable;
  descriptor.get = get;
  descriptor.set = set;
  Object.defineProperty(target, propertyKey, { get, set, configurable: true, enumerable: false });
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

// TS emits (target, key, index) for a parameter decorator, which neither flavor can honor
function assertNotParameterDecorator(propertyKey: any, descriptor: any): void {
  if (typeof descriptor === 'number') {
    throw new TypeError(
      `'${String(propertyKey)}' is a parameter and cannot be decorated. ` +
        `Apply the decorator to a method, field or getter.`,
    );
  }
}

function assertNotSetterOnly(propertyKey: string | symbol, descriptor?: PropertyDescriptor): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- presence check, never called
  if (descriptor && !descriptor.get && isFunction(descriptor.set)) {
    throw new TypeError(
      `'${String(propertyKey)}' is setter-only and cannot be decorated. ` +
        `Decorate its getter, or a method or field.`,
    );
  }
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// index of the last character of a comment or string literal starting at i, else i
function skipCommentOrString(source: string, i: number): number {
  const ch = source[i];

  if (ch === '/' && source[i + 1] === '/') {
    const end = source.indexOf('\n', i);
    return end === -1 ? source.length : end;
  }

  if (ch === '/' && source[i + 1] === '*') {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? source.length : end + 1;
  }

  if (ch === '"' || ch === "'" || ch === '`') {
    for (i++; i < source.length && source[i] !== ch; i++) {
      if (source[i] === '\\') {
        i++;
      }
    }
  }

  return i;
}

// matches only at code positions, so a comment or string holding the call text does not count
function definesOwnProperty(source: string, key: string): boolean {
  const call = new RegExp('^defineProperty\\(this,\\s*(["\'])' + escapeForPattern(key) + '\\1');

  for (let i = 0; i < source.length; i++) {
    const skipped = skipCommentOrString(source, i);
    if (skipped !== i) {
      i = skipped;
    } else if (source[i] === 'd' && call.test(source.slice(i, i + key.length + 64))) {
      return true;
    }
  }

  return false;
}

// a native class field starts a member at brace depth 1, outside any parameter list
function declaresNativeField(source: string, key: string): boolean {
  const field = new RegExp('^\\s*' + escapeForPattern(key) + '\\s*=(?![=>])');
  let braces = 0;
  let parens = 0;
  let atMemberStart = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (atMemberStart) {
      atMemberStart = false;
      if (field.test(source.slice(i, i + key.length + 64))) {
        return true;
      }
    }

    const skipped = skipCommentOrString(source, i);
    if (skipped !== i) {
      i = skipped;
    } else if (ch === '{') {
      braces++;
      atMemberStart = braces === 1;
    } else if (ch === '}') {
      braces--;
      atMemberStart = braces === 1;
    } else if (ch === '(') {
      parens++;
    } else if (ch === ')') {
      parens--;
    } else if (ch === ';') {
      atMemberStart = braces === 1 && parens === 0;
    }
  }

  return false;
}

// Under define semantics the instance owns the field before the prototype accessor can see it.
// The constructor source shows it: TS emits Object.defineProperty(this, "key") below ES2022
// and a native class field from ES2022, while assign semantics emit this.key = ...
function assertAssignSemanticsField(target: any, propertyKey: string | symbol): void {
  const ctor = isFunction(target) || typeof propertyKey !== 'string' ? undefined : target?.constructor;
  if (!isFunction(ctor)) {
    return;
  }

  const key = propertyKey as string;
  const source = Function.prototype.toString.call(ctor);
  if (definesOwnProperty(source, key) || (/^\s*class\b/.test(source) && declaresNativeField(source, key))) {
    throw new TypeError(
      `'${key}' is a field declared with define semantics, so the decorator would never run. ` +
        `Set 'useDefineForClassFields' to false in tsconfig, or declare the member as a method or getter.`,
    );
  }
}

function makeLegacyDecorator(isBind: boolean, wrap: (fn: TAnyFn, ctx: any) => TAnyFn, isAsync = false) {
  return (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) => {
    assertLegacyCallShape(propertyKey);
    assertNotBabelLegacyDescriptor(descriptor);
    assertNotParameterDecorator(propertyKey, descriptor);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- identity lookup, never called
    const stackedMethod = descriptor?.get ? boundAccessorMethods.get(descriptor.get) : undefined;
    if (stackedMethod) {
      // a bound decorator below already ran: decorate its prototype-level method, as stage-3 does
      delete descriptor!.get;
      delete descriptor!.set;
      descriptor!.value = stackedMethod;
      descriptor!.writable = true;
    }

    assertNotSetterOnly(propertyKey, descriptor);

    const isProtoMethod = !!descriptor && !descriptor.get;
    const isGetter = !!descriptor && !!descriptor.get;

    if (isGetter) {
      // User returns ready coroutine from getter, so decorator only memoizes per instance
      // Descriptor getter is invoked via .call(this) below
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called with .call(this) below
      const originalGetter = descriptor!.get!;

      const memoizingGetter = function (this: any) {
        const raw = originalGetter.call(this);

        if (!isFunction(raw)) {
          throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
        }

        if (isPrototypeObject(this)) {
          return raw;
        }

        const guarded = isAsync ? guardGeneratorResult(raw, propertyKey) : raw;
        const value = isBind ? copyFunctionMetadata(guarded, guarded.bind(this)) : guarded;
        if (resolvesToAccessor(this, propertyKey, memoizingGetter, undefined)) {
          setProperty(this, propertyKey, value);
        }

        return value;
      };
      descriptor!.get = memoizingGetter;

      return;
    }

    if (isProtoMethod) {
      const originalMethod = descriptor!.value as TAnyFn;

      if (!isFunction(originalMethod)) {
        throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
      }

      // proto wrap once, preserving metadata attached to original method
      const protoMethod = copyFunctionMetadata(originalMethod, wrap(originalMethod, undefined));

      // a static under a stacked bound decorator stays bound whatever the outer decorator is
      if (isBind || (stackedMethod && isFunction(target))) {
        definePerInstanceAccessor(target, propertyKey, descriptor!, protoMethod, (self) =>
          copyFunctionMetadata(originalMethod, wrap(originalMethod, self)),
        );
      } else {
        descriptor!.value = protoMethod;
      }

      return;
    }

    assertAssignSemanticsField(target, propertyKey);

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

      setProperty(
        this,
        propertyKey,
        copyFunctionMetadata(initialValue, wrap(initialValue, isBind ? this : undefined)),
        true,
      );
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

  return makeLegacyDecorator(isBind, (fn, ctx) => cancAsync(fn as any, ctx), true);
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
