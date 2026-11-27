import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  "const assert = require('node:assert/strict'); const load = (name) => process.env.FORMAT === 'CJS' ? Promise.resolve(require(name)) : import(name); (async()=>{const core=await load('@cancjs/promise'),tb=await load('@cancjs/toolbox'),native=await load('@cancjs/toolbox-native'),it=await load('@cancjs/toolbox/async-iter'),other=await load('toolbox-physical-copy/async-iter');assert.equal('fail' in native.LazyPromise,false);assert.equal(typeof tb.LazyPromise.fail,'function');assert.equal(typeof core.CancelablePromise.fail,'function');const e=new Error('sentinel');const x=native.LazyPromise.reject(e);const y=tb.LazyPromise.fail(e);await new Promise(r=>setImmediate(r));await assert.rejects(Promise.resolve(x),r=>r===e);await assert.rejects(Promise.resolve(y),r=>r===e);class Child extends tb.LazyPromise{static reject(){throw Error('override must not run')}}const child=Child.fail(e);assert.ok(child instanceof Child);await assert.rejects(Promise.resolve(child),r=>r===e);let count=0;class Hook extends tb.LazyPromise{static _new(...args){count++;return super._new(...args)}}const hook=Hook.fail(e);assert.equal(count,1);assert.ok(hook instanceof Hook);await assert.rejects(Promise.resolve(hook),r=>r===e);const z=tb.LazyPromise.fail(e);z.cancel();await assert.rejects(Promise.resolve(z),r=>core.isCancelError(r));;console.log('PASS row 3 '+process.env.FORMAT)})().catch(e=>{console.error(e);process.exitCode=1});";

it.each(['CJS', 'ESM'])('toolbox surface row 3 in %s physical copies', (format) => {
  const tempRoot = path.join(os.tmpdir(), 'canc');
  fs.mkdirSync(tempRoot, { recursive: true });
  const owned = fs.mkdtempSync(path.join(tempRoot, 'canc-toolbox-surface-'));
  try {
    for (const [workspace, target] of [
      ['promise', '@cancjs/promise'],
      ['toolbox', '@cancjs/toolbox'],
      ['toolbox-native', '@cancjs/toolbox-native'],
      ['toolbox', 'toolbox-physical-copy'],
    ]) {
      const dest = path.join(owned, 'node_modules', target);
      const src = path.join(repo, 'packages', 'canc-' + workspace);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(src, 'package.json'), path.join(dest, 'package.json'));
      fs.cpSync(path.join(src, 'dist'), path.join(dest, 'dist'), { recursive: true });
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    }
    const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', probe], {
      cwd: owned,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, FORMAT: format },
    });
    expect(output).toContain('PASS row 3 ' + format);
  } finally {
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
