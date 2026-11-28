---
"@cancjs/node": minor
---

Breaking prerelease named imports: limit zlib exports to supported cancelable operations and documented native stream helpers. Import removed native types from node:zlib only when your resolved Node declarations provide them; import removed native values directly on hosts that expose them. This includes peer-dependent zstd and ZIP types and the native ZipEntry and ZipFile classes. Await native entry creation before passing an entry to createZipArchive. See the package README for migration details. Retained wrapper contracts are unchanged.
