---
"@cancjs/coroutine": patch
---

A cancel that arrives while a coroutine awaits a shielded promise no longer unwinds the body at that step. The shielded step runs to the end, the body resumes with its result, and the cancel applies at the next step that is not shielded. A body that returns before reaching one settles as canceled; a body that throws first rejects with its error. This makes `finally` cleanup reliable when the `try` block finished on its own: shield the cleanup step and the statements after it still run. Applies to both `async` and `cancGen.async` bodies.
