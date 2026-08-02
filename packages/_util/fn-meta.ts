// Naming helpers for wrapper functions (coroutine, cancelify, promisify, ...). A wrapper hands back
// a brand-new function object, so stack traces and devtools lose the original name unless something
// re-derives and assigns one. Pure functions only, no module state (a shared inlinable dir is
// bundled per consuming package, so any module-level state here would be a different copy per
// package while claiming to be one).

import type { TAnyFn } from './index';

// `extends TAnyFn`, not the bare `Function` type the repo bans elsewhere: a purely optional-property
// interface is a TS "weak type", and passing a plain function value against a generic parameter
// constrained by a weak type fails with "has no properties in common" even though every function is
// structurally fine. A real call signature (`TAnyFn`) makes IFn a non-weak type and fixes that.
export interface IFn extends TAnyFn {
  displayName?: string;
}

/** Reads a function's display name, preferring `displayName` over the native `name`. */
export function getFnName(fn: IFn | undefined | null): string {
  if (!fn) {
    return '';
  }

  return fn.displayName || fn.name || '';
}

/**
 * Names a wrapper function consistently: `explicit` wins verbatim when given, otherwise the
 * generated default is `'<kind>: <sourceName>'` when `source` has a name, or bare `'<kind>'`
 * otherwise. Separator is `': '` (colon, one space), never a bare space.
 *
 * Sets both `displayName` (the conventional devtools hook) and, best-effort, the native `name` via
 * `Object.defineProperty` (some engines expose a non-configurable `name` slot; that failure must not
 * crash the wrapper, `displayName` still carries the name either way).
 */
export function setFnName<T extends IFn>(target: T, kind: string, source?: IFn, explicit?: string): T {
  const sourceName = getFnName(source);
  const name =
    explicit !== undefined ? explicit
    : sourceName ? `${kind}: ${sourceName}`
    : kind;

  target.displayName = name;

  try {
    Object.defineProperty(target, 'name', { value: name, configurable: true });
  } catch {
    // Non-configurable name slot (rare); displayName still carries the name.
  }

  return target;
}
