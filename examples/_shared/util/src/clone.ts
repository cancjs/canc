/**
 * Deep clone a value using JSON serialization.
 * Suitable for plain data (no functions, circular refs, etc).
 *
 * @param value - Value to clone
 * @returns Cloned value
 */
export function clone<T>(value: T): T {
 return JSON.parse(JSON.stringify(value)) as T;
}
