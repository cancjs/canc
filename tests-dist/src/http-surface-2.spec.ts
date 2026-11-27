import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  "const assert=require('node:assert/strict');const load=n=>process.env.FORMAT==='CJS'?Promise.resolve(require(n)):import(n);(async()=>{const ax=await load('@cancjs/axios');assert.equal('holdStream' in ax.CancelScope.prototype,false);assert.equal('rejectOnAbort' in ax.CancelScope.prototype,false);for(const n of ['cancel','link','watch','finalize','abort','toRejection','isCanceled'])assert.ok(n in ax.CancelScope.prototype,n);console.log('PASS scope surface '+process.env.FORMAT)})().catch(e=>{console.error(e);process.exitCode=1});";
it.each(['CJS', 'ESM'])('HTTP adapter surface row 2 %s', (format) => {
  const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', probe], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, FORMAT: format },
  });
  expect(output).toContain('PASS ');
});
