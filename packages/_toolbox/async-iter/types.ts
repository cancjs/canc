export const PIPE_OP_BRAND = Symbol.for('@cancjs/toolbox:PipeOp');
export const TERM_OP_BRAND = Symbol.for('@cancjs/toolbox:TermOp');
export const PIPEABLE_BRAND = Symbol.for('@cancjs/toolbox:Pipeable');

export interface IPipeOp<I, O> {
  (source: AsyncIterable<I>): AsyncIterable<O>;
  readonly [PIPE_OP_BRAND]: true;
}

export interface ITermOp<I, R> {
  (source: AsyncIterable<I>): PromiseLike<R>;
  readonly [TERM_OP_BRAND]: true;
}

export function markPipeOp<I, O>(fn: (source: AsyncIterable<I>) => AsyncIterable<O>): IPipeOp<I, O> {
  const branded = fn as any;
  Object.defineProperty(branded, PIPE_OP_BRAND, { value: true });
  return branded;
}

export function markTermOp<I, R>(fn: (source: AsyncIterable<I>) => PromiseLike<R>): ITermOp<I, R> {
  const branded = fn as any;
  Object.defineProperty(branded, TERM_OP_BRAND, { value: true });
  return branded;
}

export function isPipeOp(value: unknown): value is IPipeOp<any, any> {
  return typeof value === 'function' && (value as any)[PIPE_OP_BRAND] === true;
}

export function isTermOp(value: unknown): value is ITermOp<any, any> {
  return typeof value === 'function' && (value as any)[TERM_OP_BRAND] === true;
}

export interface IPipeableAsyncIterable<T> extends AsyncIterable<T> {
  readonly [PIPEABLE_BRAND]: true;
  pipe(...parts: any[]): any;
}

export function isPipeable(value: unknown): value is IPipeableAsyncIterable<any> {
  return typeof value === 'object' && value !== null && (value as any)[PIPEABLE_BRAND] === true;
}

export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

export interface TPromiseCtor {
  new <T>(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void, ctx?: any) => void,
    options?: any,
  ): PromiseLike<T>;
  resolve<T>(value: T | PromiseLike<T>): PromiseLike<T>;
}

export type TMakePipeableFactory = <T>(asyncIterable: AsyncIterable<T>) => IPipeableAsyncIterable<T>;
