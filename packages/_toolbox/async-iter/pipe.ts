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
 * `pipe(source)` → pipeable AsyncIterable (lazy, no pulls until consumed)
 * `pipe(source, op1, op2, ...)` → pipeable AsyncIterable
 * `pipe(source, op1, op2, ..., terminal)` → result of terminal (CancelablePromise in canc entry)
 *
 * Supports optional trailing config object (first plain object wins):
 * `pipe(source, [ops...], config)` or `pipe(source, [ops...], term, config)` (config ignored in latter)
 *
 * Terminal must be the last operator; throws TypeError otherwise.
 */
export function pipe<T>(source: AnyIterable<T>, ...parts: any[]): any {
  // Extract config first (it should be at the end after all ops/term)
  const { config: _config, rest: allParts } = splitConfig(parts);

  // Deep-flatten to a single op list
  const flatOps = flattenOps(allParts);

  // Scan for terminals; terminal must be the last non-config op.
  // Rule: once we encounter a terminal, all remaining must be terminals (but we only keep the last one).
  let terminalIndex = -1;
  let foundTerminal = false;

  for (let i = 0; i < flatOps.length; i++) {
    const isTerminal = isTermOp(flatOps[i]);

    if (isTerminal) {
      foundTerminal = true;
      terminalIndex = i;
    } else if (foundTerminal) {
      // Found a non-terminal after a terminal: error
      throw new TypeError('A terminal operator must be the last operator');
    }
  }

  // Start with the source wrapped in from()
  let composed: AsyncIterable<any> = from(source);

  // Apply all ops before the terminal (or all ops if no terminal)
  const opsToApply = terminalIndex === -1 ? flatOps : flatOps.slice(0, terminalIndex);
  for (const op of opsToApply) {
    if (isPipeOp(op)) {
      composed = op(composed);
    }
  }

  // If there's a terminal, apply it and return the result
  if (terminalIndex !== -1) {
    const terminal = flatOps[terminalIndex];
    return terminal(composed);
  }

  // No terminal: return a pipeable async iterable (lazy)
  return makePipeable(composed);
}
