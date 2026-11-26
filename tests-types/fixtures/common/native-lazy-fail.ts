import { CancelError, CancelablePromise } from '@cancjs/promise';
import type { FailureOf } from '@cancjs/promise';
import { LazyPromise } from '@cancjs/toolbox';
import { LazyPromise as NativeLazy } from '@cancjs/toolbox-native';
import type { Eq, Assert } from './assert-type';

class Missing extends Error {
  readonly missing = true;
}
const error = new Missing();
const core = CancelablePromise.fail(error);
const lazy = LazyPromise.fail(error);
const cancelled = LazyPromise.fail(new CancelError());
type A = Assert<Eq<FailureOf<typeof core>, Missing>>;
type B = Assert<Eq<FailureOf<typeof lazy>, Missing>>;
type C = Assert<Eq<FailureOf<typeof cancelled>, never>>;
// @ts-expect-error native flavor has reject, not typed fail
NativeLazy.fail(error);
const rejected: NativeLazy<never> = NativeLazy.reject(error);
