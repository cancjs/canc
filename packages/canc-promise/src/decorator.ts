import { isFunction } from '../../_util';
import { cancAsync } from './coroutine';

type TLegacyMethodDecorator = MethodDecorator | PropertyDecorator;

interface IAsyncMethodDecoratorOptions {
  bind?: boolean;
}

const memoizedBoundMapKey = Symbol('canc memoized bound methods');

// Auto-bind via a descriptor
function autoBindMethod({ target, descriptor, propertyKey, originalMethod, wrapAsync = false }: { target: any; descriptor: PropertyDescriptor; propertyKey: string; originalMethod: Function, wrapAsync?: boolean }) {
  if (!(memoizedBoundMapKey in target)) {
    Object.defineProperty(target, memoizedBoundMapKey, {
      value: new Map(),
      writable: false,
      configurable: true,
      enumerable: false,
    });
  }

  const memoizedBoundMethodsMap: Map<string, Function> = target[memoizedBoundMapKey];

  descriptor.get = function (this: any) {
    let boundMethod: Function;

    if (memoizedBoundMethodsMap.has(propertyKey)) {
      boundMethod = memoizedBoundMethodsMap.get(propertyKey)!;
    } else {
      if (wrapAsync) {
        boundMethod = cancAsync(originalMethod as GeneratorFunction, this);
      } else {
        boundMethod = originalMethod.bind(this);
      }
      memoizedBoundMethodsMap.set(propertyKey, boundMethod);
    }

    return boundMethod;
  };

  delete descriptor.value;
}

export function LegacyAsyncMethod(target: any, propertyKey: string): void;
export function LegacyAsyncMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor): void;
export function LegacyAsyncMethod(options?: IAsyncMethodDecoratorOptions): TLegacyMethodDecorator;
export function LegacyAsyncMethod(...args: [IAsyncMethodDecoratorOptions?] | [any, string] | [any, string, PropertyDescriptor]) {
  if (args.length > 1) {
    return LegacyAsyncMethod()(...args as [any, string, PropertyDescriptor]) as TLegacyMethodDecorator;
  }

  const [options] = args as [IAsyncMethodDecoratorOptions?];

  return (target: any, propertyKey: string, descriptor?: PropertyDescriptor) => {
    const isBind = options?.bind ?? false;
    const isProtoMethod = !!descriptor;
    const originalMethod = isProtoMethod ? descriptor.value : target[propertyKey];

    if (!isFunction(originalMethod)) {
      throw new TypeError('Decorator can only be applied to methods');
    }

    if (isProtoMethod) {
      if (isBind) {
        autoBindMethod({ target, descriptor, propertyKey, originalMethod, wrapAsync: true });
      } else {
        descriptor.value = cancAsync(originalMethod);
      }
    } else {
      if (isBind) {
        target[propertyKey] = cancAsync(originalMethod, target);
      } else {
        target[propertyKey] = cancAsync(originalMethod);
      }
    }
  };
}

interface IBindMethodDecoratorOptions {
  bind?: boolean;
}

const memoizedGetterMapKey = Symbol('canc memoized getter methods');

export function LegacyBindMethod(target: any, propertyKey: string): void;
export function LegacyBindMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor): void;
export function LegacyBindMethod(options?: IBindMethodDecoratorOptions): TLegacyMethodDecorator;
export function LegacyBindMethod(...args: [IBindMethodDecoratorOptions?] | [any, string] | [any, string, PropertyDescriptor]) {
  if (args.length > 1) {
    return LegacyBindMethod()(...args as [any, string, PropertyDescriptor]) as TLegacyMethodDecorator;
  }

  const [options] = args as [IBindMethodDecoratorOptions?];

  return (target: any, propertyKey: string, descriptor?: PropertyDescriptor) => {
    const isBind = options?.bind ?? true;
    const isProtoMethod = !!descriptor;
    const isGetterMethod = isProtoMethod && !!descriptor.get;
    let originalMethod: Function | undefined;

    if (!isGetterMethod) {
      originalMethod = isProtoMethod ? descriptor.value : target[propertyKey];
    }

    if (!isGetterMethod && !isFunction(originalMethod)) {
      throw new TypeError(`Decorator can only be applied to methods or getters`);
    }

    if (isGetterMethod) {
      if (!(memoizedGetterMapKey in target)) {
        Object.defineProperty(target, memoizedGetterMapKey, {
          value: new Map(),
          writable: false,
          configurable: true,
          enumerable: false,
        });
      }

      const memoizedGetterMethodsMap: Map<string, Function> = target[memoizedGetterMapKey];

      const originalGetter = descriptor.get!;

      descriptor.get = function (this: any) {
        let getterMethod: Function;

        if (memoizedGetterMethodsMap.has(propertyKey)) {
          getterMethod = memoizedGetterMethodsMap.get(propertyKey)!;
        } else {
          getterMethod = originalGetter.call(this);

          if (isFunction(getterMethod)) {
            if (isBind) {
              getterMethod = getterMethod.bind(this);
            }

            memoizedGetterMethodsMap.set(propertyKey, getterMethod);
          }
        }

        return getterMethod;
      };
    } else if (originalMethod && isBind) {
      if (isProtoMethod) {
        autoBindMethod({ target, descriptor, propertyKey, originalMethod, wrapAsync: false });
      } else {
        target[propertyKey] = originalMethod.bind(target);
      }
    }
  }
}
