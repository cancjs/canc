import { execFileSync } from 'child_process';
import * as path from 'path';

const tsxCli = require.resolve('tsx/cli');

/**
 * The guard installs on import, so each behavior needs its own process: importing it twice in
 * one jest run would stack listeners across tests.
 */
function runChild(mode: 'canceled' | 'real'): { status: number; stderr: string } {
 const entry = path.join(__dirname, 'fixtures', `${mode}.ts`);
 try {
 execFileSync(process.execPath, [tsxCli, entry], {
 encoding: 'utf8',
 stdio: ['ignore', 'pipe', 'pipe'],
 env: { ...process.env, NODE_OPTIONS: '--unhandled-rejections=throw' },
 });
 return { status: 0, stderr: '' };
 } catch (error: any) {
 return { status: error.status ?? 1, stderr: String(error.stderr ?? '') };
 }
}

describe('@shared/unhandled-rejection', () => {
 it('does not crash the process when an abandoned promise rejects with CancelError', () => {
 const result = runChild('canceled');
 expect(result.status).toBe(0);
 });

 it('still throws for a real, unhandled rejection', () => {
 const result = runChild('real');
 expect(result.status).not.toBe(0);
 });
});
