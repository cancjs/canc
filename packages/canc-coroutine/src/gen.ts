// Subpath `@cancjs/coroutine/gen`: `import * as cancGen` → cancGen.async / .await / .forAwait / .delegate.
export type { AsyncGenResult } from './coroutine-gen';
export {
  cancGenAsync as async,
  cancGenAwait as await,
  cancGenDelegate as delegate,
  cancGenForAwait as forAwait,
} from './coroutine-gen';
export { cancGenAsync, cancGenAwait, cancGenDelegate, cancGenForAwait } from './coroutine-gen';
