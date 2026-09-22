import { splitConfig } from './options';
import { from } from './sources';
import type { AnyIterable, IPipeableAsyncIterable, IPipeOp, ITermOp } from './types';
import { isPipeOp, isTermOp } from './types';
import { createPipeableWrapper } from './wrapper';

/**
 * Anything `pipe` and `from` accept as the head of a pipeline.
 *
 * A single promise yields its resolved value; anything that is neither iterable nor thenable is a
 * `TypeError` when the pipeline is driven.
 */
export type TPipeSource<T> = AnyIterable<T> | PromiseLike<T>;

/**
 * Deep-flatten an args array, unwrapping arrays recursively to a single op list.
 * Stops at branded values (ops, terms) and iterables.
 */
function flattenOps(parts: unknown[]): unknown[] {
  const result: unknown[] = [];

  function walk(item: unknown): void {
    if (Array.isArray(item)) {
      item.forEach(walk);
    } else {
      result.push(item);
    }
  }

  parts.forEach(walk);
  return result;
}

/**
 * Run a pipeline over a source, the shape every `pipe` overload resolves to.
 *
 * The overload ladder covers bare operators only, so the array-grouped form reaches this with parts
 * the types never inspected. The terminal-not-last throw is the backstop for that form.
 */
export function applyPipe(source: TPipeSource<unknown>, parts: unknown[]): unknown {
  const { config: _config, rest: allParts } = splitConfig(parts);

  const flatOps = flattenOps(allParts);

  // First terminal wins; non-terminal after it is an error
  let terminalIndex = -1;

  for (let i = 0; i < flatOps.length; i++) {
    if (isTermOp(flatOps[i])) {
      terminalIndex = i;
      break;
    }
  }

  if (terminalIndex !== -1) {
    for (let i = terminalIndex + 1; i < flatOps.length; i++) {
      if (!isTermOp(flatOps[i])) {
        throw new TypeError('A terminal operator must be the last operator');
      }
    }
  }

  let composed: AsyncIterable<unknown> = from(source);

  const opsToApply = terminalIndex === -1 ? flatOps : flatOps.slice(0, terminalIndex);
  for (const op of opsToApply) {
    if (isPipeOp(op)) {
      composed = op(composed);
    }
  }

  if (terminalIndex !== -1) {
    const terminal = flatOps[terminalIndex] as ITermOp<unknown, unknown>;
    return terminal(composed);
  }

  return makePipeable(composed);
}

/**
 * Factory to create a pipeable async iterable wrapper with .pipe method.
 * Delegates iteration to the wrapped async iterable, carries the PIPEABLE brand,
 * and exposes only `.pipe(...)` method (no terminal methods).
 */
export function makePipeable<T>(asyncIterable: AsyncIterable<T>): IPipeableAsyncIterable<T> {
  return createPipeableWrapper(asyncIterable, function pipeMethod(this: AsyncIterable<T>, ...parts: unknown[]) {
    return applyPipe(this, parts);
  });
}

/**
 * Pipe a source through operators and optionally a terminal.
 *
 * `pipe(source)` and `pipe(source, ...ops)` return a pipeable `AsyncIterable`, lazy until something
 * consumes it. `pipe(source, ...ops, terminal)` returns the terminal's promise instead.
 *
 * The overloads thread the element type from the source through every operator, so a terminal that
 * is not last, or a second terminal, matches no overload. The array-grouped form
 * `pipe(source, [op1, op2], terminal)` is outside the ladder and keeps the runtime check.
 *
 * An optional trailing config object is accepted in any position; the first plain object wins.
 */
export function pipe<A>(source: TPipeSource<A>): IPipeableAsyncIterable<A>;
export function pipe<A, R>(source: TPipeSource<A>, term: ITermOp<A, R>): PromiseLike<R>;
export function pipe<A, B1>(source: TPipeSource<A>, op1: IPipeOp<A, B1>): IPipeableAsyncIterable<B1>;
export function pipe<A, B1, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, term: ITermOp<B1, R>): PromiseLike<R>;
export function pipe<A, B1, B2>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
): IPipeableAsyncIterable<B2>;
export function pipe<A, B1, B2, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  term: ITermOp<B2, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
): IPipeableAsyncIterable<B3>;
export function pipe<A, B1, B2, B3, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  term: ITermOp<B3, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3, B4>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
): IPipeableAsyncIterable<B4>;
export function pipe<A, B1, B2, B3, B4, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  term: ITermOp<B4, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3, B4, B5>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
): IPipeableAsyncIterable<B5>;
export function pipe<A, B1, B2, B3, B4, B5, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  term: ITermOp<B5, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
): IPipeableAsyncIterable<B6>;
export function pipe<A, B1, B2, B3, B4, B5, B6, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  term: ITermOp<B6, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
): IPipeableAsyncIterable<B7>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  term: ITermOp<B7, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
): IPipeableAsyncIterable<B8>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
  term: ITermOp<B8, R>,
): PromiseLike<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, B9>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
  op9: IPipeOp<B8, B9>,
): IPipeableAsyncIterable<B9>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, B9, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
  op9: IPipeOp<B8, B9>,
  term: ITermOp<B9, R>,
): PromiseLike<R>;
/**
 * Array-grouped form, which the ladder above does not cover.
 *
 * An array of operators is matched as a whole, so the element type is not threaded through it and a
 * mismatch between two grouped operators is caught by the runtime rather than the compiler.
 */
export function pipe<A, R>(
  source: TPipeSource<A>,
  ops: readonly unknown[],
  term: ITermOp<any, R>,
  ...rest: unknown[]
): PromiseLike<R>;
export function pipe<A>(source: TPipeSource<A>, ops: readonly unknown[]): IPipeableAsyncIterable<any>;
export function pipe(source: TPipeSource<unknown>, ...parts: unknown[]): unknown {
  return applyPipe(source, parts);
}
