import { CancelablePromise, ICancelablePromiseOptions } from './cancelable-promise';
import { isFunction } from '../../_util';

export type TGeneratorLike<PYield = unknown, PReturn = any, PNext = unknown> = Omit<Generator<PYield, PReturn, PNext>, typeof Symbol.iterator>;

interface IFn extends Function {
 displayName?: string;
}

export interface IGeneratorLikeFn<TThis extends any = any> extends IFn {
 (this: TThis, ...args: any[]): TGeneratorLike;
}

type TCoroutineReturn<TFn extends IGeneratorLikeFn, TReturn = ReturnType<TFn>> = Awaited<TReturn extends Generator<unknown, infer R, unknown> ? R : never>;

export function cancAsync<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn extends any = TCoroutineReturn<TFn>, TThis extends any = any>(genFn: TFn, ctx?: TThis, options?: ICancelablePromiseOptions) {
 if (!isFunction(genFn)) {
 throw new TypeError('Argument is not a function');
 }

 const isCtx = ctx !== undefined;
 const genFnName = genFn.displayName || genFn.name;

 coroutine.displayName = 'coroutine';

 if (genFnName) {
 coroutine.displayName += ` ${genFnName}`;
 }

 function coroutine(this: any, ...args: TArgs) {
 const { promise: coroutinePromise, resolve, reject } = CancelablePromise.withResolvers(options);

 try {
 const gen: Generator = genFn.apply(isCtx ? ctx : this, args);

 coroutinePromise.handleCancel(() => {
 gen.return(undefined);
 });

 const step = (result: any) => {
 if (result.done) {
 if (!coroutinePromise.isCanceled) {
 resolve(result.value);
 }
 } else {
 const promise = CancelablePromise.resolve(result.value, options).then(onFulfilled, onRejected);
 promise['_chain'](coroutinePromise);
 }
 };

 const onFulfilled = (value: any) => {
 try {
 step(gen.next(value));
 } catch (err) {
 reject(err);
 }
 };

 const onRejected = (value: any) => {
 try {
 step(gen.throw(value));
 } catch (err) {
 reject(err);
 }
 };

 step(gen.next());
 } catch (err) {
 reject(err);
 }

 return coroutinePromise;
 }

 return coroutine;
}

// https://github.com/microsoft/TypeScript/issues/36855#issuecomment-588286256
function createYielder<TProduce, TSend>(_call: (y: TProduce) => TSend): (arg: TProduce) => Generator<TProduce, TSend, TSend> {
 return function* (arg: TProduce): Generator<TProduce, TSend, TSend> {
 return yield arg;
 }
}

type cancAwait = <T>(value: Promise<T> | T) => T;
export const cancAwait = createYielder(null as unknown as cancAwait);
