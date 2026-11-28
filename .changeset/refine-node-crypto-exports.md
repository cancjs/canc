---
"@cancjs/node": minor
---

Breaking prerelease named imports: limit crypto exports to supported cancelable operations and documented native helpers. Import removed native types from node:crypto only when your resolved Node declarations provide them; import removed native values directly on hosts that expose them. This includes peer-dependent key, cipher, digest and signing types, the historical DEFAULT_ENCODING declaration (do not rely on it), and native createMac, getMacs and parsePKCS12. See the package README for migration details. The seven peer-dependent ChaCha20, signing, verification and UUID type names and the subtle value are also no longer re-exported, so older supported Node declarations can load the package. Use native imports where available; webcrypto and randomUUID remain. Retained wrapper contracts are unchanged.
