---
'@cancjs/server-fastify': minor
---

`cancelPlugin` now wraps a generator function given as a route handler, or as a route-level `onRequest`, `preParsing`, `preValidation` or `preHandler` hook, as the route is registered. Fastify cannot run a generator function itself: a bare generator handler answered with an empty body and a bare generator hook never let the request go on. Plain and async functions are untouched. Only routes registered after the plugin are seen, and hooks added with `addHook` still need `cancelableHook` or `cancelablePreParsing`. Pass `autoWrap: false` to turn this off.
