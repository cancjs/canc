#!/usr/bin/env node
// downlevel-dts@0.11.0 gap (verified: no Awaited handling in its transform list):
// it does not rewrite the
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

  // In TS 4.2 downlevel .d.ts files, downlevel-dts expands Awaited<T1 | T2> into
  // T1 | PromiseLike<T1> | T2 | PromiseLike<T2> or Awaited<T1> | Awaited<T2>.
  // Strip the PromiseLike/Awaited wrappers in CancelablePromise method return types
  // and match PromiseLike in callbacks so TS 4.2 can verify assignability to Promise<TResult>.
  let cleanedContent = content
    .replace(
      /onFulfilled\?: \(\(value: TResult\) => TResult1\)/g,
      'onFulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>)',
    )
    .replace(
      /onRejected\?: \(\(reason: TReason<TFailure>\) => TResult2\)/g,
      'onRejected?: ((reason: TReason<TFailure>) => TResult2 | PromiseLike<TResult2>)',
    )
    .replace(
      /onRejected\?: \(\(reason: TReason<TFailure>\) => R\)/g,
      'onRejected?: ((reason: TReason<TFailure>) => R | PromiseLike<R>)',
    )
    .replace(
      /CancelablePromise<TResult1 \| PromiseLike<TResult1> \| TResult2 \| PromiseLike<TResult2>/g,
      'CancelablePromise<TResult1 | TResult2>',
    )
    .replace(
      /CancelablePromise<TResult \| PromiseLike<TResult> \| R \| PromiseLike<R>/g,
      'CancelablePromise<TResult | R>',
    )
    .replace(/CancelablePromise<TResult \| PromiseLike<TResult> \| TResult/g, 'CancelablePromise<TResult')
    .replace(/CancelablePromise<Awaited<TResult1> \| Awaited<TResult2>>/g, 'CancelablePromise<TResult1 | TResult2>')
    .replace(/CancelablePromise<Awaited<TResult> \| Awaited<R>>/g, 'CancelablePromise<TResult | R>')
    .replace(/CancelablePromise<Awaited<([^>]+)>/g, 'CancelablePromise<$1');

  if (
    /\bAggregateError\b/.test(cleanedContent) &&
    !/import.*AggregateError/.test(cleanedContent) &&
    !/\btype\s+AggregateError\b/.test(cleanedContent) &&
    !/\binterface\s+AggregateError\b/.test(cleanedContent) &&
    !/\bclass\s+AggregateError\b/.test(cleanedContent) &&
    !/\bdeclare\s+class\s+AggregateError\b/.test(cleanedContent)
  ) {
    cleanedContent = 'type AggregateError = any;\n' + cleanedContent;
  }

  const usesAwaited = /\bAwaited\s*</.test(cleanedContent);
  const declaresAwaited = /\btype\s+Awaited\b/.test(cleanedContent);

  let finalContent = cleanedContent;
  if (usesAwaited && !declaresAwaited) {
    finalContent = AWAITED_POLYFILL + cleanedContent;
  }

  if (finalContent !== content) {
    fs.writeFileSync(file, finalContent);
    return true;
  }
  return false;
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
