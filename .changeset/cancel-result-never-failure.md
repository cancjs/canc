---
"@cancjs/promise": minor
---

Declare that the promise returned by `cancel()` never rejects.

The settlement promise that `cancel()` returns for asynchronous cancel handlers now has the
failure type `never`, since it collects every handler outcome and cannot reject. Code that read
it as `unknown` keeps compiling.
