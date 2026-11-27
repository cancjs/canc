import type {
  AnyIterable,
  ICancelablePipeable,
  ICancelableTermOp,
  IPipeOp,
  TIterPredicate,
  TIterReducer,
  TIterVisitor,
} from '@cancjs/toolbox/async-iter';
import { from, pipe, map, toArray } from '@cancjs/toolbox/async-iter';
import type { Eq, Assert } from './assert-type';
// @ts-expect-error internal base
import type { ITermOp } from '@cancjs/toolbox/async-iter';
// @ts-expect-error internal base
import type { IPipeableAsyncIterable } from '@cancjs/toolbox/async-iter';
// @ts-expect-error internal type
import type { TFlatMapped } from '@cancjs/toolbox/async-iter';
// @ts-expect-error internal guard
import { isPipeable } from '@cancjs/toolbox/async-iter';

type A = Assert<Eq<AnyIterable<number>, Iterable<number> | AsyncIterable<number>>>;
const op: IPipeOp<number, string> = map(String);
const term: ICancelableTermOp<string, string[]> = toArray<string>();
const result: ICancelablePipeable<string> = from([1]).pipe(op);
pipe(result, term).cancel();
declare const pred: TIterPredicate<string>;
declare const reduce: TIterReducer<number, number>;
declare const visit: TIterVisitor<string>;
void [pred, reduce, visit];
