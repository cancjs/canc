// Pure generator source: compile independently with TS 4.2 and 5.9 at target ES5.
// Do not import Fastify declarations here: Fastify 5 requires newer compiler syntax.
export function* es5Task<T>(step: () => void, value: T, finish: () => void): Generator<Promise<void>, T, unknown> {
  try {
    step();
    yield Promise.resolve();

    return value;
  } finally {
    finish();
  }
}
