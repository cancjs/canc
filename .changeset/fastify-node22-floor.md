---
"@cancjs/server-fastify": minor
---

**Breaking:** Fastify adapter now requires Node.js 22 or later, matching the tested Fastify 5 dependency graph.

Clarify that relaxed Node.js 20 installs are unsupported and that early Node.js 22 injected-request behavior depends on the resolved Fastify dependency graph. Hono's optional Node-server dependency retains its own engine requirements.
