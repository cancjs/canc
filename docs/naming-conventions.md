# Export Naming Conventions

The export surface across `@cancjs/*` packages follows consistent naming and identity principles:

- **`canc` prefix**: Indicates an opinionated alternative to a native JS construct (`cancAsync`, `cancAwait`, `cancForAwait`, `isCancPromise`). Reserved JS keywords (`async`, `await`) cannot be top-level named exports, so the `canc` prefix provides safe named exports while maintaining family symmetry for `cancForAwait`. `isCancPromise` checks specifically for a `@cancjs/promise` instance, whereas `isCancelable` performs a structural duck-type check.
- **Sanctioned namespace aliases**: `canc` and `cancGen` are the only sanctioned namespace-import aliases (`import * as canc from '@cancjs/coroutine'`).
- **Namespace member aliases**: The `async` and `await` named-export aliases exist for namespace usage (`canc.async`). Writing `import { async as cancAsync }` is syntactically valid but not recommended because it mimics native keyword syntax.
- **Default vs Named exports**: Default exports are provided on `@cancjs/promise` (`CancelablePromise`), `@cancjs/fetch` (`cancelableFetch`), and `@cancjs/axios` (`cancelableAxios`) because these packages act as drop-in replacements for standard default-exported entities. `toolbox`, `toolbox-native`, `coroutine`, and `decorators` export named symbols only.
- **Error identity & brands**: `instanceof` is supported as a convenience but is not relied upon across different package copies or execution realms. Exported `Symbol.for('@cancjs/<pkg>:<Identifier>')` brands form the primary cross-realm contract. As an exception, `@cancjs/toolbox-native` maintains independent error class copies because it carries no external dependencies.
