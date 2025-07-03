import { isFunction } from '../../_util';
// cancAsync moved from @cancjs/promise to @cancjs/coroutine (extraction) — update import.
import { async as cancAsync } from '@cancjs/coroutine';

type TMethodDecoratorContext = ClassMethodDecoratorContext | ClassGetterDecoratorContext | ClassFieldDecoratorContext;
type TMethodDecorator = (method: any, context: TMethodDecoratorContext) => void;

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

export function AsyncMethod(value: any, context: TMethodDecoratorContext): void;
export function AsyncMethod(options?: IMethodDecoratorOptions): TMethodDecorator;
export function AsyncMethod(...args: [IMethodDecoratorOptions?] | [any, TMethodDecoratorContext]) {
 if (args.length > 1) {
 return AsyncMethod()(...args as [any, TMethodDecoratorContext]);
 }

 const [options] = args as [IMethodDecoratorOptions?];
 const isBind = options?.bind ?? false;

 return (originalMethod: any, context: TMethodDecoratorContext): any => {
 const propertyKey = context.name;
 const isMethod = (context.kind === 'method' || context.kind === 'field') && isFunction(originalMethod);
 
 if (!isMethod) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 if (context.private) {
 throw new TypeError(`'${String(propertyKey)}' is private and cannot be decorated`);
 }

 context.addInitializer(function (this: any) {
 setProperty(this, propertyKey, cancAsync(originalMethod, isBind ? this : undefined));
 });

 return originalMethod;
 };
}

export function BindMethod(value: any, context: TMethodDecoratorContext): void;
export function BindMethod(options?: IMethodDecoratorOptions): TMethodDecorator;
export function BindMethod(...args: [IMethodDecoratorOptions?] | [any, TMethodDecoratorContext]) {
 if (args.length > 1) {
 return BindMethod()(...args as [any, TMethodDecoratorContext]);
 }

 const [options] = args as [IMethodDecoratorOptions?];
 const isBind = options?.bind ?? true;

 return (originalMethod: any, context: TMethodDecoratorContext): any => {
 const propertyKey = context.name;
 const isMethod = (context.kind === 'method' || context.kind === 'field') && isFunction(originalMethod);
 const isGetter = (context.kind === 'getter');

 if (!isMethod) {
 throw new TypeError(`'${String(propertyKey)}' is not a method and cannot be decorated`);
 }

 if (context.private) {
 throw new TypeError(`'${String(propertyKey)}' is private and cannot be decorated`);
 }

 context.addInitializer(function (this: any) {
 let boundMethod: Function | undefined;

 if (isGetter) {
 boundMethod = (context as ClassGetterDecoratorContext).access.get(this) as Function;

 if (!isFunction(boundMethod)) {
 throw new TypeError(`'${String(propertyKey)}' getter result is not a function`);
 }

 if (isBind) {
 boundMethod = boundMethod.bind(this);
 }
 } else if (isBind) {
 boundMethod = originalMethod.bind(this);
 }

 // No-op for unbound non-getter methods
 if (boundMethod) {
 setProperty(this, propertyKey, boundMethod);
 }
 });

 return originalMethod;
 };
}
