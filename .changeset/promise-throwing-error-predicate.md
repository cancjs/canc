---
"@cancjs/promise": patch
---

A catch or suppress helper whose error predicate throws now rejects with the predicate error, with the original rejection as its `cause`, instead of staying pending and raising an unhandled rejection. `isCancelError`, `catchAbort`, `suppressTimeout` and the other matcher helpers treat a value whose property reads throw as no match. `catchAbort`, `suppressAbort`, `catchTimeout` and `suppressTimeout` are typed to include the aborted or timed out `CancelError` they also match.
