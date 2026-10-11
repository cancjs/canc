import { cancAsync } from '@cancjs/coroutine';
import { CancelablePromise, ISettledResult } from '@cancjs/promise';
import type {} from '@cancjs/toolbox';
import type {} from '@cancjs/toolbox-native';
import type {} from '@cancjs/fetch';
import type {} from '@cancjs/axios';
import type {} from '@cancjs/decorators';
import type {} from '@cancjs/unhandled-rejection';

const settled: CancelablePromise<ISettledResult<number>[]> = CancelablePromise.allSettled([
  CancelablePromise.resolve(1),
  CancelablePromise.resolve(2),
]);

const pair: CancelablePromise<[ISettledResult<number>, ISettledResult<string>]> = CancelablePromise.allSettled([
  CancelablePromise.resolve(1),
  CancelablePromise.resolve('a'),
] as const);

const withResolvers = CancelablePromise.withResolvers<number>();
const cancelResult: void | CancelablePromise<ISettledResult<unknown>[]> = withResolvers.cancel();

const task = cancAsync(function* () {
  return 1;
});

export { cancelResult, pair, settled, task };
