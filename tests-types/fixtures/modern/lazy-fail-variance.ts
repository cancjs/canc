import type { LazyPromise as CjsLazy } from '@cancjs/toolbox' with { 'resolution-mode': 'require' };
import type { LazyPromise as EsmLazy } from '@cancjs/toolbox' with { 'resolution-mode': 'import' };

class Detailed extends Error {
  info = { email: 'a' };
}
const narrow = (error: Detailed): never => {
  throw new Error(error.info.email);
};
const callCjs = (fn: typeof CjsLazy.fail<Error>) => fn(new Error('generic'));
const callEsm = (fn: typeof EsmLazy.fail<Error>) => fn(new Error('generic'));
// @ts-expect-error a function accepting only Detailed cannot handle arbitrary Error
callCjs(narrow);
// @ts-expect-error the ESM declaration must enforce the same strict variance
callEsm(narrow);
// @ts-expect-error strictFunctionTypes control
const control: (error: Error) => never = narrow;
void control;
