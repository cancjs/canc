import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Scans example source for the antipatterns the example-fixes tasks were meant to kill. Not a
// substitute for each task's own acceptance check; this is the repo-wide sweep so a future example
// cannot silently reintroduce a killed pattern.

const EXAMPLES_ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'out', '~~legacy examples']);

function walk(dir: string, files: string[] = []): string[] {
 for (const entry of readdirSync(dir)) {
 if (SKIP_DIRS.has(entry) || entry.startsWith('~~')) continue;
 const full = join(dir, entry);
 const stat = statSync(full);
 if (stat.isDirectory()) {
 walk(full, files);
 } else {
 files.push(full);
 }
 }
 return files;
}

const allFiles = walk(EXAMPLES_ROOT);
const sourceFiles = allFiles.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.spec.ts'));

function grep(pattern: RegExp, files: string[]): string[] {
 const hits: string[] = [];
 for (const file of files) {
 const content = readFileSync(file, 'utf8');
 const lines = content.split('\n');
 lines.forEach((line, i) => {
 if (pattern.test(line)) {
 hits.push(`${relative(EXAMPLES_ROOT, file)}:${i + 1}`);
 }
 pattern.lastIndex = 0;
 });
 }
 return hits;
}

describe('killed antipatterns stay dead', () => {
 it('no err instanceof CancelError (use isCancelError)', () => {
 const hits = grep(/instanceof CancelError/g, sourceFiles);
 expect(hits).toEqual([]);
 });

 it('no res.locals.run / request.run cancellation shim', () => {
 const hits = grep(/res\.locals\.run\b|request\.run\b/g, sourceFiles);
 expect(hits).toEqual([]);
 });

 it('no mockApi: MockApiBundle god-object param', () => {
 const hits = grep(/mockApi\s*:\s*MockApiBundle/g, sourceFiles);
 expect(hits).toEqual([]);
 });

 it('no old fromCancelable / to-cancelable.ts names', () => {
 const renameHits = grep(/\bfromCancelable\(/g, sourceFiles);
 const fileHits = allFiles.filter((f) => /(^|[/\\])to-cancelable\.ts$/.test(f));
 expect(renameHits).toEqual([]);
 expect(fileHits).toEqual([]);
 });

 it('no inline setTimeout sleep outside the shared sleep helper', () => {
 const hits = grep(/new Promise\s*\(\s*\(?\s*(r|resolve)\s*\)?\s*=>\s*setTimeout/g, sourceFiles).filter(
 (hit) => !hit.startsWith('_shared/util/src/sleep.ts'),
 );
 expect(hits).toEqual([]);
 });

 it('backup-manifest.canc.json is not committed at the examples root', () => {
 const hits = allFiles.filter((f) => f === join(EXAMPLES_ROOT, 'backup-manifest.canc.json'));
 expect(hits).toEqual([]);
 });
});
