---
"@cancjs/axios": patch
---

Aborting a request whose streamed response is being read now ends the stream with the `CancelError` when the stream has an error listener, so a `for await` loop or a `pipeline` sees the cancellation instead of a premature close. A stream with no error listener is still destroyed without an error.
