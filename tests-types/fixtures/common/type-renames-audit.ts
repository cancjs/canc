import type {
  ICancelableFetchConfig,
  ICancelableFetchLaterConfig,
  TCancelableFetchLaterPromise,
  TDeferredRequestInit,
  IFetchLaterResultLike,
} from '@cancjs/fetch';

import type {
  IAxiosInstanceLike,
  ICancelableAxiosInstance,
  ICancelableAxiosStatic,
  ICancelableAxiosContext,
} from '@cancjs/axios';

import type {
  IExecutorCtx,
  THandleCancel,
  TTimedInput,
} from '@cancjs/toolbox';

import type {
  TTimedInput as NativeTTimedInput,
} from '@cancjs/toolbox-native';

type AssertEqual<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false;

type Check1 = AssertEqual<keyof ICancelableFetchConfig, 'config' | 'fetch' | 'AbortController'>;
type Check2 = AssertEqual<keyof ICancelableFetchLaterConfig, 'config' | 'fetch' | 'AbortController' | 'activateAfter'>;
type Check3 = TCancelableFetchLaterPromise;
type Check4 = TDeferredRequestInit;
type Check5 = IFetchLaterResultLike;

type Check6 = IAxiosInstanceLike;
type Check7 = ICancelableAxiosInstance;
type Check8 = ICancelableAxiosStatic;
type Check9 = ICancelableAxiosContext;

type Check10 = IExecutorCtx;
type Check11 = THandleCancel;
type Check12 = TTimedInput<number>;
type Check13 = NativeTTimedInput<number>;

export type {
  Check1,
  Check2,
  Check3,
  Check4,
  Check5,
  Check6,
  Check7,
  Check8,
  Check9,
  Check10,
  Check11,
  Check12,
  Check13,
};
