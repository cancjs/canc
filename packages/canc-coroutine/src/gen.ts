// Subpath `@cancjs/coroutine/gen`: exports async, await, forAwait, delegate, throw
export type { AsyncGenResult, ICancAsyncGenerator } from './coroutine-gen';
export {
  cancGenAsync as async,
  cancGenAwait as await,
  cancGenDelegate as delegate,
  cancGenForAwait as forAwait,
  cancGenThrow as throw,
} from './coroutine-gen';
export { cancGenAsync, cancGenAwait, cancGenDelegate, cancGenForAwait, cancGenThrow } from './coroutine-gen';
