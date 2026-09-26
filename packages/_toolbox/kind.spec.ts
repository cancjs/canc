import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

describe('IPromiseKind failure slot', () => {
  it('defaults F to never and preserves IPromiseLikeKind behavior', () => {
    type TestNative = TPromiseOf<IPromiseLikeKind, string>;
    const checkNative: TestNative = Promise.resolve('test');
    expect(checkNative).toBeDefined();

    type TestNativeWithFailure = TPromiseOf<IPromiseLikeKind, string, Error>;
    const checkNativeWithFailure: TestNativeWithFailure = Promise.resolve('test');
    expect(checkNativeWithFailure).toBeDefined();
  });

  it('resolves both value and failure slots when read by a dual-slot kind', () => {
    interface IDualResult<V, F> {
      v: V;
      f: F;
    }

    interface IStubDualKind extends IPromiseKind {
      promise: IDualResult<this['value'], this['failure']>;
    }

    type TestDual = TPromiseOf<IStubDualKind, number, Error>;
    const checkDual: TestDual = { v: 42, f: new Error('err') };
    expect(checkDual.v).toBe(42);
    expect((checkDual.f as Error).message).toBe('err');

    type TestDualDefault = TPromiseOf<IStubDualKind, number>;
    type InferredValue = TestDualDefault['v'];
    const val: InferredValue = 123;
    expect(val).toBe(123);
  });
});
