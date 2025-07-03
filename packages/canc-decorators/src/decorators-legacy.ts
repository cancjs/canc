import { isFunction } from '../../_util';
// cancAsync moved from @cancjs/promise to @cancjs/coroutine (extraction) — update import.
import { async as cancAsync } from '@cancjs/coroutine';

type TLegacyMethodDecorator = MethodDecorator | PropertyDecorator;

interface IMethodDecoratorOptions {
 bind?: boolean;
}

const memoizedBoundMapKey = Symbol('canc bound methods');

function setProperty(target: any, key: string | symbol, value: any) {
 Object.defineProperty(target, key, {
 value,
 writable: false,
 configurable: true,
 enumerable: false,
 });
}

// Late bind via a descriptor
function lateBindMethod({target, descriptor, propertyKey, originalMethod, wrapAsync = false}: {
 target: any;
 descriptor: PropertyDescriptor;
 propertyKey: string;
 originalMethod: Function,
 wrapAsync?: boolean
}) {
 if (!(memoizedBoundMapKey in target)) {
 setProperty(target, memoizedBoundMapKey, new Map());
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
export function LegacyAsyncMethod(options?: IMethodDecoratorOptions): TLegacyMethodDecorator;
export function LegacyAsyncMethod(...args: [IMethodDecoratorOptions?] | [any, string] | [any, string, PropertyDescriptor]) {
 if (args.length > 1) {
 return LegacyAsyncMethod()(...args as [any, string, PropertyDescriptor]) as TLegacyMethodDecorator;
 }

 const [options] = args as [IMethodDecoratorOptions?];
 const isBind = options?.bind ?? false;

 return (target: any, propertyKey: string, descriptor?: PropertyDescriptor) => {
 const isProtoMethod = !!descriptor;
 const originalMethod = isProtoMethod ? descriptor.value : target[propertyKey];

 if (!isFunction(originalMethod)) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 if (isProtoMethod) {
 if (isBind) {
 lateBindMethod({target, descriptor, propertyKey, originalMethod, wrapAsync: true});
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

const memoizedGetterMapKey = Symbol('canc getter methods');

export function LegacyBindMethod(target: any, propertyKey: string): void;
export function LegacyBindMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor): void;
export function LegacyBindMethod(options?: IMethodDecoratorOptions): TLegacyMethodDecorator;
export function LegacyBindMethod(...args: [IMethodDecoratorOptions?] | [any, string] | [any, string, PropertyDescriptor]) {
 if (args.length > 1) {
 return LegacyBindMethod()(...args as [any, string, PropertyDescriptor]) as TLegacyMethodDecorator;
 }

 const [options] = args as [IMethodDecoratorOptions?];
 const isBind = options?.bind ?? true;

 return (target: any, propertyKey: string, descriptor?: PropertyDescriptor) => {
 const isProtoMethod = !!descriptor;
 const isGetter = isProtoMethod && !!descriptor.get;
 let originalMethod: Function | undefined;

 if (!isGetter) {
 originalMethod = isProtoMethod ? descriptor.value : target[propertyKey];
 }

 if (!isGetter && !isFunction(originalMethod)) {
 throw new TypeError(`'${String(propertyKey)}' is not a method or getter and cannot be decorated`);
 }

 if (isGetter) {
 if (!(memoizedGetterMapKey in target)) {
 setProperty(target, memoizedGetterMapKey, new Map());
 }

 const memoizedGetterMethodsMap: Map<string, Function> = target[memoizedGetterMapKey];

 const originalGetter = descriptor.get!;

 descriptor.get = function (this: any) {
 let getterMethod: Function;

 if (memoizedGetterMethodsMap.has(propertyKey)) {
 getterMethod = memoizedGetterMethodsMap.get(propertyKey)!;
 } else {
 getterMethod = originalGetter.call(this);
 const isGetterMethod = isFunction(getterMethod);

 if (isGetterMethod && isBind) {
 getterMethod = getterMethod.bind(this);
 }

 // Prevent multiple errors for non-function getter result too
 memoizedGetterMethodsMap.set(propertyKey, getterMethod);

 if (!isGetterMethod) {
 throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
 }
 }

 return getterMethod;
 };
 } else if (originalMethod && isBind) {
 if (isProtoMethod) {
 lateBindMethod({target, descriptor, propertyKey, originalMethod, wrapAsync: false});
 } else {
 setProperty(target, propertyKey, originalMethod.bind(target));
 }
 }
 }
}