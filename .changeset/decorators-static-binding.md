---
"@cancjs/decorators": patch
---

Bind static methods to the class that defines them. A bound static read through a subclass, or under a different stacking order of `AsyncMethod` and `BindMethod`, used to bind to the wrong class or stay unbound. Members installed by the decorators are now writable, so a bound method, a memoized getter or a static can be replaced or spied on after it was read, and a subclass that assigns a decorated TypeScript legacy field no longer throws. Decorated legacy fields are enumerable own properties.
