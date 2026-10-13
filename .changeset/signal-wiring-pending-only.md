---
"@cancjs/promise": patch
---

Wire `signal` abort listeners only on a promise that is still pending after its executor runs.

An executor that settles synchronously no longer leaves an abort listener behind on its signal, and an executor that aborts its own signal now cancels the promise. An abort listener never throws from the signal's event dispatch, even under `strict` or on a shielded promise.

Errors thrown by cancel handlers while an abort signal cancels the promise no longer escape the abort dispatch. A direct `cancel()` call still throws them.
