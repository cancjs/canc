import path from 'node:path';

import ts from 'typescript';

// the threadpool caveat, verbatim, shared by every wrapper's JSDoc in ./index.ts
const THREADPOOL_CAVEAT =
  'Canceling stops the wait, not the work: the call keeps running on node' +
  "'s threadpool and the slot it holds there stays occupied until it finishes.";

// every wrapper this module adds; a name missing from the emitted `.d.ts`, or present without
// the caveat in its own doc comment, fails the assertion below
const WRAPPED_EXPORT_NAMES = [
  'pbkdf2',
  'scrypt',
  'argon2',
  'generateKeyPair',
  'generateKey',
  'generatePrime',
  'checkPrime',
  'hkdf',
  'randomBytes',
  'randomFill',
  'encapsulate',
  'decapsulate',
];

/**
 * Compile `./index.ts` for real, with declaration emission on, and return the emitted `.d.ts`
 * text.
 *
 * Reading the actual compiler output (rather than the source's own JSDoc comments) is what makes
 * this an assertion on what ships rather than on what was typed: a comment TypeScript drops during
 * emission (rare, but declaration emission does drop some comment placements) would pass a
 * source-text grep and still ship undocumented.
 */
function emitCryptoDeclarations(): string {
  const rootDir = path.resolve(__dirname, '../../../..');
  const configPath = path.join(rootDir, 'tsconfig.test.json');

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);

  const entry = path.join(__dirname, 'index.ts');
  const program = ts.createProgram([entry], {
    ...parsed.options,
    declaration: true,
    emitDeclarationOnly: true,
    noEmit: false,
    skipLibCheck: true,
  });

  let emitted: string | undefined;
  const result = program.emit(undefined, (fileName, text) => {
    if (fileName.endsWith('crypto/index.d.ts') || fileName.endsWith('crypto\\index.d.ts')) {
      emitted = text;
    }
  });

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(result.diagnostics)
    .filter((d) => d.file?.fileName === entry);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => rootDir,
      getCanonicalFileName: (f) => f,
      getNewLine: () => '\n',
    });
    throw new Error(`crypto/index.ts failed to compile for declaration emit:\n${formatted}`);
  }

  if (!emitted) {
    throw new Error('declaration emit produced no output for crypto/index.d.ts');
  }

  return emitted;
}

/** The doc comment (if any) immediately preceding a top-level `export const <name>` declaration. */
function jsDocBefore(dts: string, exportedName: string): string {
  const declPattern = new RegExp(`export declare const ${exportedName}\\s*:`);
  const declMatch = declPattern.exec(dts);
  if (!declMatch) {
    throw new Error(`emitted .d.ts has no export declaration for ${exportedName}`);
  }

  const before = dts.slice(0, declMatch.index);
  const commentEnd = before.lastIndexOf('*/');
  if (commentEnd === -1) {
    return '';
  }

  // a doc comment immediately precedes the declaration only if nothing but whitespace sits between
  // the comment's closing `*/` and the declaration itself
  const between = dts.slice(commentEnd + 2, declMatch.index);
  if (!/^\s*$/.test(between)) {
    return '';
  }

  const commentStart = before.lastIndexOf('/**');
  return commentStart === -1 ? '' : dts.slice(commentStart, commentEnd + 2);
}

describe('@cancjs/node/crypto emitted declarations', () => {
  let dts: string;

  beforeAll(() => {
    dts = emitCryptoDeclarations();
  }, 60000);

  it.each(WRAPPED_EXPORT_NAMES)("%s's JSDoc carries the threadpool caveat", (name) => {
    const doc = jsDocBefore(dts, name);
    expect(doc.length).toBeGreaterThan(0);

    // strip the `/** ... */` fencing and each line's leading ` * `, then collapse the remaining
    // line breaks to spaces, so a caveat sentence wrapped across two comment lines still matches
    // against the single-line constant above
    const normalized = doc
      .replace(/^\/\*\*/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    expect(normalized).toContain(THREADPOOL_CAVEAT);
  });
});
