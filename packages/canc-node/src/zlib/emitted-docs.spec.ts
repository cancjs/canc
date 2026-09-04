import path from 'node:path';

import ts from 'typescript';

// the two tiers get two different sentences (a third, for zipFiles, is asserted separately below):
// a uniform "supports cancellation" line would be false for the buffer tier and an undersell for
// the iterable one, so this file checks each tier's own wording rather than one shared string
const BUFFER_TIER_CAVEAT =
  'Canceling stops the wait, not the work: the call keeps running on node' +
  "'s threadpool and the slot it holds there stays occupied until it finishes.";

const ITERABLE_TIER_CAVEAT =
  'Canceling genuinely stops the work: it stops pulling from the source between chunks and calls ' +
  "the source iterator's own return(), so nothing more reaches the codec after that point.";

const ZIP_TIER_CAVEAT =
  'Canceling checkpoints at a file boundary: no further entry is opened after that point, the ' +
  'entries already written stay in the archive, and none of them is rolled back.';

// buffer tier: promisify-callback over a single call, cancel is short-circuit only
const BUFFER_TIER_NAMES = [
  'brotliCompress',
  'brotliDecompress',
  'deflate',
  'deflateRaw',
  'gzip',
  'gunzip',
  'inflate',
  'inflateRaw',
  'unzip',
  'zstdCompress',
  'zstdDecompress',
];

// iterable tier (node 24+): cancel actually stops the pull between chunks
const ITERABLE_TIER_NAMES = [
  'compressGzip',
  'decompressGzip',
  'compressDeflate',
  'decompressDeflate',
  'compressBrotli',
  'decompressBrotli',
  'compressZstd',
  'decompressZstd',
];

/**
 * Compile `./index.ts` for real, with declaration emission on, and return the emitted `.d.ts` text.
 *
 * Reading the actual compiler output (rather than the source's own JSDoc comments) is what makes
 * this an assertion on what ships rather than on what was typed: a comment TypeScript drops during
 * emission would pass a source-text grep and still ship undocumented.
 */
function emitZlibDeclarations(): string {
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
    if (fileName.endsWith('zlib/index.d.ts') || fileName.endsWith('zlib\\index.d.ts')) {
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
    throw new Error(`zlib/index.ts failed to compile for declaration emit:\n${formatted}`);
  }

  if (!emitted) {
    throw new Error('declaration emit produced no output for zlib/index.d.ts');
  }

  return emitted;
}

/** The doc comment (if any) immediately preceding a top-level `export declare const <name>` declaration. */
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

/** Collapse a `/** ... *\/` doc comment to one normalized line, so a sentence wrapped across lines
 * still matches the single-line constants above. */
function normalizeDoc(doc: string): string {
  return doc
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('@cancjs/node/zlib emitted declarations', () => {
  let dts: string;

  beforeAll(() => {
    dts = emitZlibDeclarations();
  }, 60000);

  it.each(BUFFER_TIER_NAMES)("buffer tier: %s's JSDoc says cancel stops the wait, not the work", (name) => {
    const doc = jsDocBefore(dts, name);
    expect(doc.length).toBeGreaterThan(0);
    expect(normalizeDoc(doc)).toContain(BUFFER_TIER_CAVEAT);
  });

  it.each(ITERABLE_TIER_NAMES)("iterable tier: %s's JSDoc says cancel genuinely stops the work", (name) => {
    const doc = jsDocBefore(dts, name);
    expect(doc.length).toBeGreaterThan(0);
    expect(normalizeDoc(doc)).toContain(ITERABLE_TIER_CAVEAT);
  });

  it('zip tier: zipFiles carries its own third sentence, distinct from the other two', () => {
    const doc = normalizeDoc(jsDocBefore(dts, 'zipFiles'));
    expect(doc).toContain(ZIP_TIER_CAVEAT);
    expect(doc).not.toContain(BUFFER_TIER_CAVEAT);
    expect(doc).not.toContain(ITERABLE_TIER_CAVEAT);
  });

  it('the buffer-tier and iterable-tier sentences are not the same sentence', () => {
    expect(BUFFER_TIER_CAVEAT).not.toBe(ITERABLE_TIER_CAVEAT);
  });

  it('no buffer-tier export accidentally carries the iterable-tier sentence, or vice versa', () => {
    for (const name of BUFFER_TIER_NAMES) {
      expect(normalizeDoc(jsDocBefore(dts, name))).not.toContain(ITERABLE_TIER_CAVEAT);
    }
    for (const name of ITERABLE_TIER_NAMES) {
      expect(normalizeDoc(jsDocBefore(dts, name))).not.toContain(BUFFER_TIER_CAVEAT);
    }
  });
});
