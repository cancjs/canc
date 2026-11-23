---
'@cancjs/promise': patch
---

Observe already yielded allSettled inputs when iteration later throws, avoiding unhandled rejections while keeping the documented iterator exception outside declared failure types.
