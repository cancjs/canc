# Examples

Runnable examples import `@cancjs/*` through the workspace symlinks in `node_modules` (set up by
`yarn` at the monorepo root), so run them from the repo root after `yarn` / `yarn build`.

`@shared/*` packages (under `_shared/`) are examples-internal workspace packages, never
published — the scope reads like a path alias but resolves through the normal workspace symlink.

## demo-promise-basics

Vanilla-Promise vs `@cancjs/promise` twin scripts showing the same fetch chain, one canceled
partway through with a plain `AbortController` flag check, the other with `cancel()`.

```
yarn examples:test
yarn examples:typecheck
```

See `demo-promise-basics/README.md` for the runnable start scripts.

## app-react-suspense

Travel details loaded under React Suspense. A `CancelableSuspense` boundary cancels the abandoned
request when the user picks another destination mid-load, next to a naive in-child attempt that
leaks. See `app-react-suspense/README.md`.

## app-vue-suspense

Product detail page under Vue `<Suspense>`. A generator setup wrapped by `cancelableSetup` cancels
the in-flight load when the component's scope tears down. See `app-vue-suspense/README.md`.
