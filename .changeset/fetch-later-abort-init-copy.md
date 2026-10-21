---
"@cancjs/fetch": patch
---

An external signal aborting `cancelableFetchLater` now rejects the promise with a `CancelError`, stops the activation polling and detaches from the signal. Before, the promise stayed pending and the polling ran forever. Both `cancelableFetch` and `cancelableFetchLater` now copy the request options member by member, so options inherited from a prototype or defined as getters reach `fetch`. Before, a spread dropped them, and a POST built that way went out as a bodiless GET.
