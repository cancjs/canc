import type { TAnyFn } from '../../_util/guards';
import { isFunction } from '../guards';
import type { TPromiseCtor } from './types';

function isGeneratorFn(value: unknown): boolean {
  if (!isFunction(value)) {
    return false;
  }
  const fnStr = Function.prototype.toString.call(value);
  return /\bfunction\s*\*/.test(fnStr) || /\basync\s+function\s*\*/.test(fnStr);
}

function isThenable<T = any>(value: unknown): value is PromiseLike<T> {
  return typeof value === 'object' && value !== null && typeof (value as any).then === 'function';
}

export function runCallback(
  Impl: TPromiseCtor,
  cb: TAnyFn,
  args: any[],
): any {
  let result;
  try {
    result = cb(...args);
  } catch (err) {
    return Impl.resolve(Promise.reject(err));
  }

  if (isThenable(result)) {
    return result;
  }

  if (result && typeof result.next === 'function') {
    return driveGenerator(Impl, result);
  }

  return Impl.resolve(result);
}

export function driveGenerator<T>(
  Impl: TPromiseCtor,
  gen: Generator<PromiseLike<any> | any, T, any>,
  onStop?: () => void,
): PromiseLike<T> {
  let stopped = false;

  const resume = (value: any): PromiseLike<any> => {
    if (stopped) {
      return Impl.resolve(undefined);
    }

    try {
      const { value: yielded, done } = gen.next(value);

      if (done) {
        return Impl.resolve(yielded);
      }

      return Impl.resolve(yielded).then(resume, (err) => {
        if (stopped) {
          return undefined;
        }
        try {
          return driveUnwind(gen, err);
        } catch (throwErr) {
          return Impl.resolve(Promise.reject(throwErr));
        }
      });
    } catch (err) {
      return Impl.resolve(Promise.reject(err));
    }
  };

  const driveUnwind = (g: Generator<any, T, any>, err: any): any => {
    const { value: yielded, done } = g.throw(err);

    if (done) {
      return Impl.resolve(yielded);
    }

    return Impl.resolve(yielded).then(resume, (nextErr) => driveUnwind(g, nextErr));
  };

  const prom = Impl.resolve(undefined).then(() => resume(undefined));

  if (onStop) {
    /**/
  }

  return prom;
}
