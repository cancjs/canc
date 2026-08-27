---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) Add `map`, which runs a mapper over an array or a sync iterable with a `concurrency` cap and returns the results in input order however the mappers settle. The default is unbounded, so pass `concurrency` to pace the work. The first rejection cancels the siblings and rejects with that reason, the way `all` behaves; under `stopOnError: false` every item runs to a settlement and the rejection carries an AggregateError of the failures in input order. Canceling the returned promise cancels what is in flight and drops what is queued, so a queued mapper is never called at all. On the native twin there is nothing to cancel: the returned promise is not cancelable, and an early rejection drops the queued mappers while the running ones finish.
