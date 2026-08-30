import nodeFs from 'node:fs';
import nodeFsPromises from 'node:fs/promises';

import fsJson from '../../surface/fs.json';
import { getFs } from './registry';
import { cancelify, gatedWrapped, promisifyWrapped, signalWrapped, teardownWrapped } from './wrap';

const entryMap = new Map(fsJson.exports.map((e: any) => [e.name, e]));
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);

export const access = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).access(...args));
export const appendFile = signalWrapped(
  promisifyWrapped((...args: any[]) => getFs().appendFile(...args)),
  entryMap.get('appendFile'),
);
export const chmod = promisifyWrapped((...args: any[]) => getFs().chmod(...args));
export const chown = promisifyWrapped((...args: any[]) => getFs().chown(...args));
export const constants = nodeFsPromises.constants;
export const copyFile = teardownWrapped(
  promisifyWrapped((...args: any[]) => getFs().copyFile(...args)),
  (_val, args) => {
    const dest = args[1];
    if (typeof dest === 'string' || Buffer.isBuffer(dest) || dest instanceof URL) {
      getFs().unlink(dest, () => {});
    }
  },
);
export const cp = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).cp(...args));
export const glob = gatedWrapped(
  nodeMajor >= 22,
  'glob',
  '22',
  cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).glob(...args)),
);
export const lchmod = promisifyWrapped((...args: any[]) => getFs().lchmod(...args));
export const lchown = promisifyWrapped((...args: any[]) => getFs().lchown(...args));
export const link = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).link(...args));
export const lstat = signalWrapped(
  promisifyWrapped((...args: any[]) => getFs().lstat(...args)),
  entryMap.get('lstat'),
);
export const lutimes = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).lutimes(...args));
export const mkdir = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).mkdir(...args));
export const mkdtemp = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).mkdtemp(...args));
export const mkdtempDisposable = gatedWrapped(
  nodeMajor >= 24,
  'mkdtempDisposable',
  '24.4.0',
  cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).mkdtempDisposable(...args)),
);
export const open = teardownWrapped(
  promisifyWrapped((...args: any[]) => getFs().open(...args)),
  (fh) => {
    fh?.close?.();
  },
);
export const opendir = teardownWrapped(
  cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).opendir(...args)),
  (dir) => {
    dir?.close?.();
  },
);
export const readFile = signalWrapped(
  promisifyWrapped((...args: any[]) => getFs().readFile(...args)),
  entryMap.get('readFile'),
);
export const readdir = promisifyWrapped((...args: any[]) => getFs().readdir(...args));
export const readlink = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).readlink(...args));
export const realpath = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).realpath(...args));
export const rename = promisifyWrapped((...args: any[]) => getFs().rename(...args));
export const rm = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).rm(...args));
export const rmdir = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).rmdir(...args));
export const stat = signalWrapped(
  promisifyWrapped((...args: any[]) => getFs().stat(...args)),
  entryMap.get('stat'),
);
export const statfs = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).statfs(...args));
export const symlink = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).symlink(...args));
export const truncate = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).truncate(...args));
export const unlink = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).unlink(...args));
export const utimes = cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).utimes(...args));
export const watch = signalWrapped(
  cancelify((ctx, ...args: any[]) => (nodeFsPromises as any).watch(...args)),
  entryMap.get('watch'),
);
export const writeFile = signalWrapped(
  promisifyWrapped((...args: any[]) => getFs().writeFile(...args)),
  entryMap.get('writeFile'),
);

export const Dir = nodeFs.Dir;
export const Dirent = nodeFs.Dirent;
export const Stats = nodeFs.Stats;
export type { BigIntStats, StatsFs as StatFs } from 'node:fs';
export const exists = promisifyWrapped((nodeFs as any).exists);
