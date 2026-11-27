import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  "const assert=require('node:assert/strict');const load=n=>process.env.FORMAT==='CJS'?Promise.resolve(require(n)):import(n);(async()=>{const hono=await load('@cancjs/server-hono');assert.equal('CLIENT_CLOSED_STATUS'in hono,false);for(const n of ['CLIENT_DISCONNECTED','HANDLER_TIMEOUT','SERVER_SHUTDOWN','cancelableHandler','cancelMiddleware','cancelErrorHandler','getRequestSignal','createShutdown'])assert.ok(n in hono,n);console.log('PASS Hono exports '+process.env.FORMAT)})().catch(e=>{console.error(e);process.exitCode=1});";
it.each(['CJS', 'ESM'])('HTTP adapter surface row 6 %s', (format) => {
  const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', probe], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, FORMAT: format },
  });
  expect(output).toContain('PASS ');
});
