#!/usr/bin/env node
// downlevel-dts@0.11.0 gap (verified: no Awaited handling in its transform list —
// see .claude/tasks/-packaging-types.md P4-1): it does not rewrite the
// built-in `Awaited<T>` utility type, which is lib-defined starting TS 4.5.
// On the TS 4.2 floor `Awaited` doesn't exist in scope, so any .d.ts still
// referencing it fails to resolve for a TS-4.2 consumer ("Cannot find name
// 'Awaited'"). This script runs after downlevel-dts against a variant dir and
// injects a local, file-scoped polyfill type alias into any .d.ts that uses
// `Awaited<...>` but doesn't declare it itself. A local declaration in a module
// shadows the ambient/global lib one, so this is safe to also run against
// variants targeting TS >=4.5 (harmless no-op there since Awaited already
// resolves — script still adds a shadow, functionally identical to the lib type).
//
// Usage: node scripts/patch-awaited.js <dir-of-d.ts-files>
const fs = require('fs');
const path = require('path');

const AWAITED_POLYFILL = 'type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;\n';

function collectDtsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectDtsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function patchFile(file) {
  const content = fs.readFileSync(file, 'utf8');

  const usesAwaited = /\bAwaited\s*</.test(content);
  const declaresAwaited = /\btype\s+Awaited\b/.test(content);

  if (!usesAwaited || declaresAwaited) {
    return false;
  }

  fs.writeFileSync(file, AWAITED_POLYFILL + content);
  return true;
}

function main() {
  const dir = process.argv[2];

  if (!dir) {
    console.error('Usage: node scripts/patch-awaited.js <dir-of-d.ts-files>');
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const patched = collectDtsFiles(dir).filter(patchFile);

  if (patched.length) {
    console.log(`patch-awaited: injected Awaited polyfill into ${patched.length} file(s):`);
    for (const file of patched) {
      console.log(` ${file}`);
    }
  } else {
    console.log('patch-awaited: no files needed patching');
  }
}

main();
