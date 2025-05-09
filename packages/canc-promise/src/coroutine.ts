import { CancelablePromise } from './cancelable-promise';
import { isFunction } from '../../_util';

type TCoroutineGenFn<TThis extends any = any> = {
  (this: TThis, ...args: any[]): Generator,
  displayName?: string,
};

type TCoroutineReturn<TFn extends TCoroutineGenFn, TReturn = ReturnType<TFn>> = Awaited<TReturn extends Generator<unknown, infer R, unknown> ? R : never>;

export function cancAsync<TFn extends TCoroutineGenFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn extends any = TCoroutineReturn<TFn>, TThis extends any = any>(genFn: TFn, ctx?: TThis) {
  if (!isFunction(genFn)) {
    throw new TypeError('Argument is not a function');
  }

  const isCtx = arguments.length > 1;
  const genFnName = genFn.displayName || genFn.name;

  coroutine.displayName = 'coroutine';

  if (genFnName) {
    coroutine.displayName += ` ${genFnName}`;
  }

  function coroutine(this: any, ...args: TArgs) {
    const promise = new CancelablePromise<TReturn>((resolve, reject, handleCancel) => {
      const gen: Generator = genFn.apply(isCtx ? ctx : this, args);

      handleCancel((reason) => {
        gen.return(undefined);
      });

      function onFulfilled(value: any) {
        try {
          step(gen.next(value));
        } catch (err) {
          reject(err);
        }
      }

      function onRejected(value: any) {
        try {
          step(gen.throw(value));
        } catch (err) {
          reject(err);
        }
      }

      function step(result: any) {
        if (result.done) {
          if (!promise.isCanceled) {
            resolve(result.value);
          }
        } else {
          CancelablePromise.resolve(result.value).then(onFulfilled, onRejected);
        }
      }

      step(gen.next());
    });

    return promise;
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
