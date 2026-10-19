---
"@cancjs/unhandled-rejection": patch
---

An unhandled `any()` rejection whose members were all canceled is now suppressed like a single `CancelError`, instead of crashing the process. An aggregate holding any other error is still reported. With `abort` or `timeout` enabled, members of those kinds count as suppressible too.
