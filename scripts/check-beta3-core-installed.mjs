#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owned = path.join(os.tmpdir(), 'canc', 'p104d-integrated');
const tar = path.join(owned, 'tar');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PROBE =
  "\nimport assert from 'node:assert/strict';\nimport path from 'node:path';\nimport { createRequire } from 'node:module';\nimport { pathToFileURL } from 'node:url';\nconst req = createRequire(import.meta.url);\nconst { FORMAT, A, B } = process.env;\nconst entry = (root, name, file) => path.join(root, 'node_modules', '@cancjs', name, 'dist', file + (FORMAT === 'CJS' ? '.cjs' : '.mjs'));\nconst load = async (root, name, file='index') => {\n  const filename=entry(root,name,file);\n  return FORMAT === 'CJS' ? req(filename) : import(pathToFileURL(filename).href);\n};\nconst pmod=await load(A,'promise');\nconst CP=pmod.default || pmod.CancelablePromise || pmod;\nconst co=await load(A,'coroutine','gen');\nconst other=await load(B,'coroutine','gen');\nconst tb=await load(A,'toolbox','async-iter');\nconst turn=()=>new Promise((resolve)=>setImmediate(resolve));\nconst turns=async(n=4)=>{for(let i=0;i<n;i++)await turn();};\nconst unhandled=[];\nprocess.on('unhandledRejection',(reason)=>unhandled.push(reason));\nconst watchdog=setTimeout(()=>{console.error('integrated probe unresolved');process.exit(3)},8000);\n\n{\n  const sentinel=new Error('iterator failed');\n  const ignored=CP.reject(new Error('yielded rejection'));\n  function* source(){yield ignored; throw sentinel;}\n  let failure;\n  try{await CP.allSettled(source());}catch(error){failure=error;}\n  assert.equal(failure,sentinel,'allSettled must preserve iterator error');\n  await turns();\n  assert.deepEqual(unhandled,[],'allSettled exposed an unhandled input rejection');\n  console.log('PASS packed '+FORMAT+' allSettled');\n}\n{\n  let resolveLoser;\n  const loser=new CP((resolve)=>{resolveLoser=resolve;});\n  const winner=CP.resolve(1);\n  const ongoing=(async()=>{await CP.race([winner,loser]);return await loser;})();\n  await turns();\n  assert.equal(loser.isCanceled,false,'direct awaited race loser canceled');\n  resolveLoser(37);\n  assert.equal(await ongoing,37,'race loser value lost');\n  console.log('PASS packed '+FORMAT+' race');\n}\n{\n  const gate=CP.withResolvers();\n  const original=new Error('transform failed');\n  let finallyCount=0;\n  const factory=co.cancGenAsync(function*(){\n    try {\n      yield* co.cancGenAwait(gate.promise);\n      yield 7;\n    }finally{finallyCount++;}\n  },{transformYield(value){if(value===7)throw original;return value;}});\n  const it=factory();\n  const active=it.next();\n  const returned=it.return('bye');\n  gate.resolve();\n  let failure;\n  try{await active;}catch(error){failure=error;}\n  assert.equal(failure,original,'generator must reject original transform error');\n  assert.deepEqual(await returned,{value:'bye',done:true});\n  assert.equal(finallyCount,1);\n  await turns();\n  assert.deepEqual(unhandled,[],'generator leaked unhandled transform error');\n  console.log('PASS packed '+FORMAT+' generator');\n}\n{\n  const closeError=new Error('close failure');\n  let pulls=0,closes=0;\n  const source={\n    [Symbol.asyncIterator](){return this;},\n    next(){pulls++;return Promise.resolve({value:3,done:false});},\n    return(){closes++;throw closeError;},\n  };\n  let failure;\n  try{await tb.pipe(source,tb.find(()=>true));}catch(error){failure=error;}\n  assert.equal(failure,closeError,'successful terminal hid close error');\n  assert.equal(closes,1);\n  assert.equal(pulls,1);\n  console.log('PASS packed '+FORMAT+' close');\n}\n{\n  for(const kind of ['forAwait','toArray','delegate']){\n    const log=[];\n    const gate=new Promise(()=>{});\n    const expected='after-'+kind;\n    const factory=co.cancGenAsync(function*(){\n      log.push('start');\n      try{\n        if(kind==='forAwait')yield* other.cancGenForAwait([1],function*(){\n          log.push('callback1');\n          yield* other.cancGenAwait(gate);\n        });\n        else if(kind==='toArray')yield* other.cancGenForAwait.toArray([gate]);\n        else{\n          const sub={\n            [Symbol.asyncIterator](){return this;},\n            next(){log.push('inner-next');return gate;},\n            return(){log.push('inner-return');return Promise.resolve({done:true});},\n          };\n          yield* other.cancGenDelegate(sub);\n        }\n        log.push(expected);\n      }finally{log.push('outer-finally');}\n    },{asyncCancel:true});\n    const it=factory(),active=it.next();\n    await turns();\n    const drain=active.cancel();\n    assert.ok(drain&&typeof drain.then==='function');\n    const result=await Promise.resolve(active).then(()=> 'resolved',e=>e&&e.name==='CancelError'?'canceled':'bad cancellation');\n    await drain;\n    assert.equal(result,'canceled');\n    assert.equal(log.includes(expected),false,'cross-copy post-body continuation '+kind+' '+JSON.stringify(log));\n    const exact=kind==='forAwait'?['start','callback1','outer-finally'] : kind==='toArray'?['start','outer-finally']:['start','inner-next','inner-return','outer-finally'];\n    assert.deepEqual(log,exact);\n    console.log('PASS packed '+FORMAT+' physical-copy '+kind);\n  }\n}\nassert.deepEqual(unhandled,[]);\nclearTimeout(watchdog);\n";

function run(command, args, cwd, purpose, env = {}) {
  const shell = process.platform === 'win32' && command.endsWith('.cmd');
  const argv = shell ? args.map((arg) => (/[\s"]/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg)) : args;
  const childEnv = { ...process.env, ...env, NODE_OPTIONS: '' };
  delete childEnv.npm_config_allow_scripts;
  const result = spawnSync(command, argv, {
    cwd,
    shell,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 25000,
    env: childEnv,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      purpose + ': exit ' + result.status + '\n' + String(result.error || '') + '\n' + result.stdout + result.stderr,
    );
  }
  return result.stdout;
}

function npmRun(args, cwd, purpose) {
  return run(npm, args, cwd, purpose, { npm_config_userconfig: path.join(owned, 'empty-npmrc') });
}

function pack(name) {
  const cwd = path.join(root, 'packages', name);
  const file = npmRun(['pack', '--ignore-scripts', '--pack-destination', tar], cwd, 'pack ' + name)
    .trim()
    .split(/\r?\n/)
    .pop();
  const filename = path.join(tar, file);
  assert.ok(fs.existsSync(filename), 'missing candidate tarball ' + filename);
  const hash = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  console.log('packed ' + name + ': ' + filename + ' sha256=' + hash);
  return filename;
}

function physical(copy, pkg, subpath) {
  const dir = path.join(owned, copy, 'node_modules', '@cancjs', pkg);
  const filename = path.join(dir, 'dist', subpath);
  assert.equal(fs.existsSync(filename), true, 'missing actual installed entry ' + filename);
  assert.equal(fs.lstatSync(dir).isSymbolicLink(), false, 'workspace symlink ' + dir);
  assert.ok(fs.realpathSync.native(dir).toLowerCase().includes('p104d-integrated'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '1.1.0-beta.2', 'expected candidate package version');
  console.log('resolved ' + copy + ' ' + pkg + ' ' + subpath + ': ' + filename);
}

function main() {
  fs.rmSync(owned, { recursive: true, force: true });
  fs.mkdirSync(tar, { recursive: true });
  fs.writeFileSync(path.join(owned, 'empty-npmrc'), '');
  if (!process.argv.includes('--already-built')) {
    for (const name of ['canc-promise', 'canc-coroutine', 'canc-toolbox']) {
      npmRun(['run', 'build', '-w', '@cancjs/' + name.slice(5)], root, 'build ' + name);
    }
  } else {
    // Bounded runs may build the three packages separately before the installed probe.
    for (const name of ['canc-promise', 'canc-coroutine', 'canc-toolbox']) {
      assert.ok(
        fs.existsSync(path.join(root, 'packages', name, 'dist/index.cjs')),
        'missing separately built package ' + name,
      );
    }
  }
  const packs = ['canc-promise', 'canc-coroutine', 'canc-toolbox'].map(pack);
  for (const copy of ['A', 'B']) {
    const cwd = path.join(owned, copy);
    fs.mkdirSync(cwd, { recursive: true });
    npmRun(
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--no-save', ...packs],
      cwd,
      'install ' + copy,
    );
    for (const pkg of ['promise', 'coroutine', 'toolbox']) {
      const files =
        pkg === 'promise' ? ['index.cjs', 'index.mjs']
        : pkg === 'coroutine' ? ['gen.cjs', 'gen.mjs']
        : ['async-iter.cjs', 'async-iter.mjs'];
      for (const filename of files) physical(copy, pkg, filename);
    }
  }
  if (process.argv.includes('--mutant-unwind')) {
    for (const filename of ['gen.cjs', 'gen.mjs']) {
      const target = path.join(owned, 'B', 'node_modules/@cancjs/coroutine/dist', filename);
      const source = fs.readFileSync(target, 'utf8');
      assert.ok(source.includes('@cancjs/coroutine:genReturnUnwind'));
      fs.writeFileSync(
        target,
        source.replace('@cancjs/coroutine:genReturnUnwind', '@cancjs/coroutine:GenReturnUnwind'),
      );
    }
  }
  for (const format of ['CJS', 'ESM']) {
    run(
      process.execPath,
      ['--input-type=module', '--eval', PROBE],
      owned,
      'packed ' + format + ' integrated consumer',
      { FORMAT: format, A: path.join(owned, 'A'), B: path.join(owned, 'B') },
    )
      .trim()
      .split(/\r?\n/)
      .forEach((line) => console.log(line));
  }
  console.log('PASS packed integrated candidate CJS/ESM');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
