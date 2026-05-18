// Subpath `@cancjs/coroutine/iter`: `import * as cancIter` → cancIter.async / .await / .forAwait / .delegate.
export {
	cancIterAsync as async,
	cancIterAwait as await,
	cancIterForAwait as forAwait,
	cancIterDelegate as delegate,
} from './coroutine-iter';
export { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from './coroutine-iter';
export type { AsyncIterResult } from './coroutine-iter';
