import type { AnyIterable } from '../../../_toolbox/async-iter';
import { pipe as toolboxPipe } from '../../../_toolbox/async-iter/pipe';

/**
 * Pipe a source through operators and optionally a terminal bound to CancelablePromise.
 * Re-exports the shared algorithm from _toolbox which is promise-ctor agnostic.
 */
export function pipe<T>(source: AnyIterable<T>, ...parts: any[]): any {
  return toolboxPipe(source, ...parts);
}
