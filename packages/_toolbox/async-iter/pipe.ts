import { splitConfig } from './options';
import { from } from './sources';
import type { AnyIterable, IPipeableAsyncIterable } from './types';
import { isPipeOp, isTermOp } from './types';
import { createPipeableWrapper } from './wrapper';

/**
 * Deep-flatten an args array, unwrapping arrays recursively to a single op list.
 * Stops at branded values (ops, terms) and iterables.
 */
function flattenOps(parts: any[]): any[] {
  const result: any[] = [];

  function walk(item: any): void {
    if (Array.isArray(item) && !isPipeOp(item) && !isTermOp(item)) {
      item.forEach(walk);
    } else {
      result.push(item);
    }
  }

  parts.forEach(walk);
  return result;
}

/**
 * Factory to create a pipeable async iterable wrapper with .pipe method.
 * Delegates iteration to the wrapped async iterable, carries the PIPEABLE brand,
 * and exposes only `.pipe(...)` method (no terminal methods).
 */
export function makePipeable<T>(asyncIterable: AsyncIterable<T>): IPipeableAsyncIterable<T> {
  return createPipeableWrapper(asyncIterable, function pipeMethod(this: AsyncIterable<T>, ...parts: any[]): any {
    return pipe(this, ...parts);
  });
}

/**
 * Pipe a source through operators and optionally a terminal.
 * `pipe(source)` returns a pipeable AsyncIterable (lazy, no pulls until consumed).
 * `pipe(source, op1, op2, ...)` returns a pipeable AsyncIterable.
 * `pipe(source, op1, op2, ..., terminal)` returns the terminal's result (a CancelablePromise in the canc entry).
 *
 * Supports an optional trailing config object (the first plain object wins):
 * `pipe(source, [ops...], config)` or `pipe(source, [ops...], term, config)` (config is ignored in the latter).
 *
 * Terminal must be the last operator; throws TypeError otherwise.
 *
 * Variadic pipeline typing and operator inference are deferred. The signature
 * uses any at the boundary until typed overload ladders land.
 */
export function pipe<T>(source: AnyIterable<T>, ...parts: any[]): any {
  const { config: _config, rest: allParts } = splitConfig(parts);

  const flatOps = flattenOps(allParts);

  // terminal must be the last non-config op; once one appears, everything after must also be a
  // terminal (only the last is kept)
  let terminalIndex = -1;
  let foundTerminal = false;

  for (let i = 0; i < flatOps.length; i++) {
    const isTerminal = isTermOp(flatOps[i]);

    if (isTerminal) {
      foundTerminal = true;
      terminalIndex = i;
    } else if (foundTerminal) {
      throw new TypeError('A terminal operator must be the last operator');
    }
  }

  let composed: AsyncIterable<any> = from(source);

  const opsToApply = terminalIndex === -1 ? flatOps : flatOps.slice(0, terminalIndex);
  for (const op of opsToApply) {
    if (isPipeOp(op)) {
      composed = op(composed);
    }
  }

  if (terminalIndex !== -1) {
    const terminal = flatOps[terminalIndex];
    return terminal(composed);
  }

  return makePipeable(composed);
}
