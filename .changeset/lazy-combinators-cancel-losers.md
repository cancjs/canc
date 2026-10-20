---
"@cancjs/toolbox": minor
---

`LazyPromise.race`, `any`, `all` and `allSettled` now cancel the lazy inputs they no longer need. A race loser is canceled once the winner settles, the remaining inputs of `all` once one rejects, and every lazy input when the aggregate is canceled. A lazy input that something else still consumes keeps running. An unstarted lazy listed after one that has already settled cannot win a race and is no longer started. A teardown returned by the executor now also runs when the work is canceled because its last consumer left. `toAbortSignal` no longer starts a lazy promise: the signal aborts when the lazy is canceled, before or after it starts.
