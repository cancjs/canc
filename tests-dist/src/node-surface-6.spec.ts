import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  "const assert=require('node:assert/strict'),{createRequire}=require('node:module'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');\nconst load=n=>process.env.FORMAT==='CJS'?Promise.resolve(require(n)):import(n);\n(async()=>{const data={},core=await load('@cancjs/promise'),node=await load('@cancjs/node'),c=await load('@cancjs/node/crypto'),z=await load('@cancjs/node/zlib'),d=await load('@cancjs/node/dgram'),f=await load('@cancjs/node/fs/extra'),nc=require('node:crypto'),nz=require('node:zlib');\nconst tempRoot=path.join(os.tmpdir(),'canc');fs.mkdirSync(tempRoot,{recursive:true});const owned=fs.mkdtempSync(path.join(tempRoot,'json-'));try{const file=path.join(owned,'nested','out.json');await f.outputJson(file,{ok:true},{spaces:2});assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{ok:true});assert.equal(typeof f.mkdirp,'function');assert.equal(typeof f.mkdirs,'function')}finally{fs.rmSync(owned,{recursive:true,force:true})}\nconsole.log('PASS row 6 '+process.env.FORMAT)\n})().catch(e=>{console.error(e);process.exitCode=1});\n";

it.each(['CJS', 'ESM'])('Node public surface row 6 %s', (format) => {
  const tempRoot = path.join(os.tmpdir(), 'canc');
  fs.mkdirSync(tempRoot, { recursive: true });
  const owned = fs.mkdtempSync(path.join(tempRoot, 'canc-node-surface-'));
  try {
    for (const [src, target] of [
      ['node', '@cancjs/node'],
      ['node', 'node-physical-copy'],
      ['promise', '@cancjs/promise'],
      ['toolbox', '@cancjs/toolbox'],
    ]) {
      const dest = path.join(owned, 'node_modules', target);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(repo, 'packages', 'canc-' + src, 'package.json'), path.join(dest, 'package.json'));
      fs.cpSync(path.join(repo, 'packages', 'canc-' + src, 'dist'), path.join(dest, 'dist'), { recursive: true });
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    }
    fs.cpSync(path.join(repo, 'node_modules', 'graceful-fs'), path.join(owned, 'node_modules', 'graceful-fs'), {
      recursive: true,
      dereference: true,
    });
    const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', probe], {
      cwd: owned,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, FORMAT: format },
    });
    expect(output).toContain('PASS row 6 ' + format);
  } finally {
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
