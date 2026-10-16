---
"@cancjs/decorators": patch
---

Bind and memoize decorated members per receiver. Reading a member through a class prototype (for example `jest.spyOn`) no longer caches a prototype-bound function for every instance, an undecorated subclass override wins over a bound parent method, and a `super` call no longer caches the parent function on the instance. Standard decorators with `bind: true` now wrap the prototype method too, so `Object.create`, prototype calls and `super` get the cancelable function, and a bound method read through a `Proxy` is bound to the proxy. Both stacking orders of `AsyncMethod` and `BindMethod` produce a cancelable method, and a memoized getter keeps its paired setter working.
