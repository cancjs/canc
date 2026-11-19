---
'@cancjs/server-fastify': minor
---

Add `cancelableHook(hook, options?)` for `onRequest`, `preValidation` and `preHandler` hooks, and `cancelablePreParsing(hook, options?)` for `preParsing` hooks. Each wraps the hook so it is canceled with the request and is typed as fastify's own async hook, so it mounts without a cast; one `cancelableHook` value mounts on any of its three stages. A generator hook stops at its next `yield`, a hook settling hands the request on with the deadline still running, and a `preParsing` hook gets the payload stream and may return a replacement. An `onRequestAbort` hook is refused with a `TypeError`, since its request is already aborted when it runs, and so is a hook called with a payload or an error. `cancelableHandler` mounted as a hook gets the same checks instead of failing on the missing reply.
