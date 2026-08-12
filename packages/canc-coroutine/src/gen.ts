// Subpath `@cancjs/coroutine/gen`: `import * as cancGen` → cancGen.async / .await / .forAwait / .delegate / .throw.
export type { AsyncGenResult } from './coroutine-gen';
export {
  cancGenAsync as async,
  cancGenAwait as await,
  cancGenDelegate as delegate,
  cancGenForAwait as forAwait,
  cancGenThrow as throw,
} from './coroutine-gen';
export { cancGenAsync, cancGenAwait, cancGenDelegate, cancGenForAwait, cancGenThrow } from './coroutine-gen';
