# @shared/lib

Publishable-tidy canc helper code shared by the canc examples. Unlike `@shared/mock-api` and
`@shared/util`, files here are copy targets: each one is written as if it were already a
`@cancjs/*` package, and a reader may copy it into their own project today.

Empty for now. Its former concurrency pool prototype shipped as `@cancjs/toolbox`'s `limit`;
examples import that directly instead of a local copy. The next extraction candidate lands here.
