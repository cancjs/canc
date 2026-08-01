/**
 * A wait duration accepted by the time helpers (`delay`, `minDelay`, `timeout`): either a fixed
 * millisecond count, or a `[min, max]` tuple resolved once, at call time, to a value uniform in
 * `[min, max)`. Sharing this type and its validation here (rather than per helper) is what keeps
 * the range rules identical across all three.
 */
export type TDuration = number | [min: number, max: number];

/**
 * Whether an argument can be read as a duration. This is what tells a duration apart from a
 * trailing options bag, and what lets `minDelay` reject a call that never supplied one.
 */
export function isDurationShaped(value: unknown): value is TDuration {
  return typeof value === 'number' || Array.isArray(value);
}

/**
 * Resolve a `TDuration` to a concrete millisecond count. A `[min, max]` tuple is rolled ONCE,
 * here, uniform in `[min, max)`. A malformed range throws synchronously (a plain `RangeError`,
 * never a rejection): a bad duration is a mistake at the call site, not a runtime failure of the
 * work being timed. Callers resolve the duration BEFORE constructing the returned promise so this
 * throw reaches the caller directly instead of being swallowed into a rejection by the promise
 * executor.
 */
export function resolveDuration(duration: TDuration): number {
  if (!Array.isArray(duration)) {
    return duration;
  }

  const [min, max] = duration;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError('duration range bounds must be finite numbers');
  }

  if (min < 0 || max < 0) {
    throw new RangeError('duration range bounds must not be negative');
  }

  if (min > max) {
    throw new RangeError('duration range min must not exceed max');
  }

  return min + Math.random() * (max - min);
}

/** The parsed shape of a "(duration) | (input, duration)" call, options split out. */
export interface ITimedArgs<TInput> {
  hasInput: boolean;
  input?: TInput;
  duration: TDuration;
  options?: object;
}

/**
 * Parse the "(duration, options?) | (input, duration, options?)" call shape shared by `delay` and
 * `timeout`. The two forms are told apart by ARITY, plus - only in the two-argument case, where
 * arity alone is ambiguous - by whether the trailing argument is duration-shaped. Never by
 * inspecting the first argument's type: that would misparse `delay(42, 200)` (`42` is the input)
 * against `delay(200, options)` (`200` is the duration, the second argument is the options bag).
 *
 * `defaultDuration` makes the duration itself optional, which only `timeout` needs (its default is
 * a passthrough). Supplying it is the one case where the leading argument's shape is consulted: a
 * lone argument that cannot be a duration has to be the input, as in `timeout(promise)`. A lone
 * NUMBER is still the duration, so `timeout(200)` stays a deadline rather than a resolved 200.
 */
export function parseTimedArgs<TInput>(rest: readonly unknown[], defaultDuration?: TDuration): ITimedArgs<TInput> {
  const durationOptional = defaultDuration !== undefined;

  if (rest.length === 0) {
    return { hasInput: false, duration: defaultDuration!, options: undefined };
  }

  if (rest.length === 1) {
    if (durationOptional && !isDurationShaped(rest[0])) {
      return { hasInput: true, input: rest[0] as TInput, duration: defaultDuration as TDuration, options: undefined };
    }

    return { hasInput: false, duration: rest[0] as TDuration, options: undefined };
  }

  if (rest.length === 2 && !isDurationShaped(rest[1])) {
    // The second argument is not duration-shaped, so it is the options bag.
    if (durationOptional && !isDurationShaped(rest[0])) {
      return {
        hasInput: true,
        input: rest[0] as TInput,
        duration: defaultDuration as TDuration,
        options: rest[1] as object,
      };
    }

    return { hasInput: false, duration: rest[0] as TDuration, options: rest[1] as object };
  }

  // (input, duration) or (input, duration, options)
  return { hasInput: true, input: rest[0] as TInput, duration: rest[1] as TDuration, options: rest[2] as object };
}
