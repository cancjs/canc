import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Windows cannot deliver a real SIGINT to a child process (Node on win32 has no POSIX signals;
// child.kill('SIGINT') terminates the process directly instead of invoking its handler), so this
// drives the real SIGINT handler in-process via process.emit instead of child_process + kill.
// The handler code under test is identical to what a real Ctrl-C would invoke.

const cwd = join(__dirname, '..');
const manifestPath = join(cwd, 'backup-manifest.canc.json');

describe('app-cli-graceful SIGINT', () => {
 afterEach(() => {
 rmSync(manifestPath, { force: true });
 jest.resetModules();
 jest.restoreAllMocks();
 });

 it('cancels the whole task tree, exits 0, and writes a partial manifest with queued urls', async () => {
 let exitCode: number | undefined;
 let exited: () => void;
 const exitedPromise = new Promise<void>((resolve) => {
 exited = resolve;
 });

 jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
 exitCode = code ?? 0;
 exited();
 return undefined as never;
 }) as never);

 await import('../src/main-canc.js');

 // let the backup start and get a download or two in flight before interrupting
 await new Promise((resolve) => setTimeout(resolve, 15));
 process.emit('SIGINT', 'SIGINT');

 await exitedPromise;

 expect(exitCode).toBe(0);

 const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
 expect(manifest.partial).toBe(true);
 // some urls never started -- queued markers prove the pool did not spin up new downloads
 // after cancel
 expect(manifest.entries.some((e: { status: string }) => e.status === 'queued')).toBe(true);
 }, 10000);
});
