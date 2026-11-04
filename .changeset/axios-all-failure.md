---
"@cancjs/axios": minor
---

**Breaking:** An annotation `CancelablePromise<T[], never>` on an `axios.all` result over requests needs their failure set, `AxiosError | Unlisted`.

`axios.all` now reads the failure set of each member, as `CancelablePromise.all` does: requests give `AxiosError | Unlisted`, a native promise gives `Unlisted`, and plain values give `never`. Before, it declared `never` for any list. The resolved array is typed with the awaited member values.
