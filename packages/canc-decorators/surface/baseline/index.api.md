# Public surface: @cancjs/decorators .

Generated. Do not edit by hand.

- Declarations: `packages/canc-decorators/dist/types/index.d.ts`
- Exports: 6

## `AsyncMethod<This, Value>` (function)

```text
<This, Value>(value: (this: This) => Value, context: ClassGetterDecoratorContext<This, Value>): (this: This) => Value
<This, Fn extends (...a: any[]) => any>(value: Fn, context: ClassMethodDecoratorContext<This, Fn>): Fn
<This, Value>(value: undefined, context: ClassFieldDecoratorContext<This, Value>): (this: This, init: Value) => Value
(options?: IMethodDecoratorOptions | undefined): IMemberDecorator
```

## `BabelLegacyAsyncMethod` (function)

```text
(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): any
(options?: IMethodDecoratorOptions | undefined): MethodDecorator | PropertyDecorator
```

## `BabelLegacyBindMethod` (function)

```text
(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): any
(options?: IMethodDecoratorOptions | undefined): MethodDecorator | PropertyDecorator
```

## `BindMethod<This, Value>` (function)

```text
<This, Value>(value: (this: This) => Value, context: ClassGetterDecoratorContext<This, Value>): (this: This) => Value
<This, Fn extends (...a: any[]) => any>(value: Fn, context: ClassMethodDecoratorContext<This, Fn>): Fn
<This, Value>(value: undefined, context: ClassFieldDecoratorContext<This, Value>): (this: This, init: Value) => Value
(options?: IMethodDecoratorOptions | undefined): IMemberDecorator
```

## `LegacyAsyncMethod` (function)

```text
(target: any, propertyKey: string | symbol): void
(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void
(options?: IMethodDecoratorOptions | undefined): any
```

## `LegacyBindMethod` (function)

```text
(target: any, propertyKey: string | symbol): void
(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void
(options?: IMethodDecoratorOptions | undefined): any
```
