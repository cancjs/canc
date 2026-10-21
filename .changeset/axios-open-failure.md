---
"@cancjs/axios": minor
---

**Breaking:** An annotation `CancelablePromise<R, AxiosError>` on a wrapped request needs `| Unlisted` added. A raw `.catch` is unaffected.

The failure type of wrapped request methods is now an open set: `AxiosError<T, D> | Unlisted`.
