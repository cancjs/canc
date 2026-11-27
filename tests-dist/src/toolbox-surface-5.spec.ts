import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  "const assert = require('node:assert/strict'); const load = (name) => process.env.FORMAT === 'CJS' ? Promise.resolve(require(name)) : import(name); (async()=>{const core=await load('@cancjs/promise'),tb=await load('@cancjs/toolbox'),native=await load('@cancjs/toolbox-native'),it=await load('@cancjs/toolbox/async-iter'),other=await load('toolbox-physical-copy/async-iter');assert.deepEqual(Object.keys(it).sort(),['concat','drop','every','filter','find','flatMap','forEach','from','includes','map','pipe','reduce','some','take','toArray','zip','zipKeyed']);const result=await it.pipe([1,2],it.map(x=>x+1),it.toArray());assert.deepEqual(result,[2,3]);const cross=it.pipe([3],other.toArray());assert.equal(typeof cross.cancel,'function');assert.deepEqual(await cross,[3]);console.log('PASS row 5 '+process.env.FORMAT)})().catch(e=>{console.error(e);process.exitCode=1});";

it.each(['CJS', 'ESM'])('toolbox surface row 5 in %s physical copies', (format) => {
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
    expect(output).toContain('PASS row 5 ' + format);
  } finally {
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
