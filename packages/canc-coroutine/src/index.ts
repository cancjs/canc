export * from './coroutine';
export * from './coroutine-iter';
// `async`/`await` aliases (reserved words valid as ModuleExportName via aliased re-export),
// lets consumers do `import * as coroutine from '@cancjs/coroutine'; coroutine.async(...)`.
// Named-import form needs an alias (`import { async as cancAsync } from '@cancjs/coroutine'`),
// legal but awkward, document in README.
export { cancAsync as async, cancAwait as await, cancForAwait as forAwait } from './coroutine';
