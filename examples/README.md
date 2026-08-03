# Examples

Every example is one small application written twice: `-vanilla` and `-canc`. Same files, same
function names, same order, so the two versions are meant to be read as a diff. The vanilla side
is not a strawman. Where cancellation is the point of the example, it carries the real
`AbortController` attempt with its guards and cleanup, and the comparison is against that.

The `app-*` projects integrate with a framework, a server or a library. The `demo-*` projects are
smaller and each teaches one part of the ecosystem.

## Running

The examples consume the built `dist` of each package through npm `file:` dependencies, and this
directory is a separate npm project, so it installs on its own.

```sh
# in the monorepo root
npm install
npm run build

# here
cd examples
npm install
```

Then run either flavor of an example:

```sh
cd demo-promise-basics
npm run start:vanilla
npm run start:canc
```

Frontend examples add `dev:vanilla` and `dev:canc` for a dev server with hot reload, and
`build:vanilla` / `build:canc` for a production build.

Everything at once, from the monorepo root:

```sh
npm run examples:test
npm run examples:typecheck
```

Each example has its own README with the file map, what to diff, and an honesty note about which
layer cancellation actually reaches.

## React and state management

* [app-react](app-react) travel search typeahead. Every keystroke cancels the previous search, so
	a slow response cannot overwrite a newer one. Hover prefetch cancels on unhover.
* [app-react-suspense](app-react-suspense) destination details under Suspense. A cancelable
	boundary aborts the load the user walked away from.
* [app-react-zustand](app-react-zustand) album and track browser. Switching albums fast cancels
	the store action still in flight.

## Vue

* [app-vue](app-vue) marketplace catalog. A cancelable watch cancels the previous run before
	starting the next, which is the awaited-watch footgun in plain Vue.
* [app-vue-pinia](app-vue-pinia) checkout wizard. Leaving a step cancels the calls that step
	started.
* [app-vue-suspense](app-vue-suspense) product page under `<Suspense>`, cancellation on scope
	teardown.

## Angular

* [app-angular](app-angular) orders admin with a detail pane. The same service is built twice, one
	with the coroutine decorator and one wiring `canc.async` by hand.

## Servers and databases

* [app-express-kysely](app-express-kysely) slow report endpoint over SQLite. Client disconnect
	cancels the remaining query chain.
* [app-fastify-mongoose](app-fastify-mongoose) hotel availability search. The route handler is a
	coroutine, the repository is cancelified, so no signal is threaded through the service.
* [app-nestjs-typeorm](app-nestjs-typeorm) invoicing API. An interceptor cancels the request scope,
	and a bulk endpoint rolls its transaction back in a shielded `finally`.

## AI and streaming

* [app-ai-chat-stop](app-ai-chat-stop) support chat with a Stop button that stops the spend, across
	browser, server and the model call.
* [app-ai-rag-pipeline](app-ai-rag-pipeline) retrieval pipeline (embed, retrieve, rerank, stream)
	as one cancelable flow. No API key needed.
* [app-ws-progress](app-ws-progress) video export progress over a WebSocket. Cancel stops the
	transcode, not just the progress bar.

## Third-party libraries

* [app-axios](app-axios) an axios instance whose request methods return cancelable promises,
	against the manual request registry it replaces.
* [app-rxjs](app-rxjs) log viewer where an observable stream drives promise-based work.
	`switchMap` alone does not stop it, and this is what does.

## CLI and concurrency

* [app-cli-graceful](app-cli-graceful) site backup CLI. Ctrl-C cancels the whole task tree
	gracefully, a second one exits immediately.
* [app-crawler-race](app-crawler-race) site health crawl through a concurrency pool. One cancel
	prunes the entire in-flight subtree.

## Concept demos

* [demo-promise-basics](demo-promise-basics) cancellation as a rejection, cancel handlers, and the
	two-way propagation an `AbortController` cannot express.
* [demo-chain-propagation](demo-chain-propagation) propagation down and bubbling up, with
	`bubble: false` and `shield: true` in context.
* [demo-combinators](demo-combinators) what `all`, `any`, `race` and `allSettled` do to the losers.
* [demo-coroutine](demo-coroutine) `canc.async` and `canc.await` through a checkout flow, including
	an acknowledged cancellation gap.
* [demo-fetch](demo-fetch) cancelable requests, external signals, pre-aborted signals, timeout
	composition.
* [demo-toolbox](demo-toolbox) pollers, retries, delays and timeouts under cancellation.
* [demo-decorators](demo-decorators) one client class wired four ways, one per decorator dialect
	plus the manual form.
* [demo-signal-interop](demo-signal-interop) bridges in both directions between signals and
	cancelable promises.
* [demo-async-dispose](demo-async-dispose) `await using` scopes, cleanup ordering, shield survival,
	disposal after settle.

## Shared code

Packages under `_shared/` are internal to the examples and are never published. The `@shared`
scope reads like a path alias and resolves through the normal workspace symlink.

* `@shared/mock-api` fake domain APIs that log their calls, including an `aborted` marker so an
	example can prove a request was really stopped
* `@shared/util` small cross-example helpers such as `sleep`
* `
Code under an example's `src/lib/` is written to be copied. It is general-purpose enough to be
extracted into a package later, so treat it as a starting point for your own hooks, composables
and adapters.
