---
"@cancjs/decorators": patch
---

Throw a descriptive error for unsupported decorator use: a TS legacy field under `useDefineForClassFields`, a getter returning an unwrapped generator function, a parameter decorator, and a setter-only member. The define-semantics check is best-effort and ignores comments and string literals in the constructor source.
