// Subpath `@cancjs/coroutine/gen`: `import * as cancGen` → cancGen.async / .await / .forAwait / .delegate.
export {
	cancGenAsync as async,
	cancGenAwait as await,
	cancGenForAwait as forAwait,
	cancGenDelegate as delegate,
} from './coroutine-gen';
export { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenDelegate, awaited } from './coroutine-gen';
export type { AsyncGenResult } from './coroutine-gen';
