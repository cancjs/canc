import nodeFs from 'node:fs';
import nodeFsPromises from 'node:fs/promises';

import fsJson from '../../surface/fs.json';
import { features } from '../features';
import { decorate } from './file-handle';
import { getFs } from './registry';
import { retryOpen } from './retry-open';
import {
  adopted,
  gatedWrapped,
  IManifestEntry,
  promisifySignalWrapped,
  promisifyWrapped,
  signalWrapped,
  teardownWrapped,
  TNodeFn,
} from './wrap';

// node's own signatures are overloaded per call, so the bindings reach both APIs through one view
const fsp = nodeFsPromises as unknown as Record<string, TNodeFn>;
const fsCallbacks = nodeFs as unknown as Record<string, TNodeFn>;

const entries = new Map<string, IManifestEntry>(fsJson.exports.map((entry) => [entry.name, entry as IManifestEntry]));

/** Resolve the callback function on every call, so a setFs after module load still takes effect. */
function viaFs(name: string): TNodeFn {
  return (...args: unknown[]) => (getFs()[name] as TNodeFn)(...args);
}

/**
 * Resolve the promise-API function on every call. A patched implementation passes `fs.promises`
 * through untouched, so node's own is the fallback and usually the answer.
 */
function viaFsPromises(name: string): TNodeFn {
  return (...args: unknown[]) => {
    const promises = getFs().promises as Record<string, TNodeFn> | undefined;
    const fn = promises?.[name];
    return typeof fn === 'function' ? fn.apply(promises, args) : fsp[name](...args);
  };
}

/** Cancel teardown for the calls that hand back something holding a descriptor. */
function closeQuietly(value: unknown): void {
  const closable = value as { close?: () => unknown } | null | undefined;
  if (!closable || typeof closable.close !== 'function') {
    return;
  }

  void Promise.resolve(closable.close()).then(undefined, () => {});
}

export const access = adopted(fsp.access);
export const appendFile = promisifySignalWrapped(viaFs('appendFile'), entries.get('appendFile'), 2);
export const chmod = promisifyWrapped(viaFs('chmod'));
export const chown = promisifyWrapped(viaFs('chown'));
export const constants = nodeFsPromises.constants;
export const copyFile = teardownWrapped(promisifyWrapped(viaFs('copyFile')), (_value, args) => {
  const dest = args[1];
  if (typeof dest === 'string' || Buffer.isBuffer(dest) || dest instanceof URL) {
    getFs().unlink(dest, () => {});
  }
});
export const cp = adopted(fsp.cp);
export const glob = gatedWrapped(features.hasGlob, 'glob', '22', adopted(fsp.glob));
export const lchmod = promisifyWrapped(viaFs('lchmod'));
export const lchown = promisifyWrapped(viaFs('lchown'));
export const link = adopted(fsp.link);
export const lstat = promisifySignalWrapped(viaFs('lstat'), entries.get('lstat'), 1);
export const lutimes = adopted(fsp.lutimes);
export const mkdir = adopted(fsp.mkdir);
export const mkdtemp = adopted(fsp.mkdtemp);
export const mkdtempDisposable = gatedWrapped(
  features.hasMkdtempDisposable,
  'mkdtempDisposable',
  '24.4.0',
  adopted(fsp.mkdtempDisposable),
);
export const open = teardownWrapped(
  (...args: unknown[]) => retryOpen(() => viaFsPromises('open')(...args)).then(decorate),
  closeQuietly,
);
export const opendir = teardownWrapped(
  (...args: unknown[]) => retryOpen(() => viaFsPromises('opendir')(...args)),
  closeQuietly,
);
export const readFile = promisifySignalWrapped(viaFs('readFile'), entries.get('readFile'), 1);
export const readdir = promisifyWrapped(viaFs('readdir'));
export const readlink = adopted(fsp.readlink);
export const realpath = adopted(fsp.realpath);
export const rename = promisifyWrapped(viaFs('rename'));
export const rm = adopted(fsp.rm);
export const rmdir = adopted(fsp.rmdir);
export const stat = promisifySignalWrapped(viaFs('stat'), entries.get('stat'), 1);
export const statfs = adopted(fsp.statfs);
export const symlink = adopted(fsp.symlink);
export const truncate = adopted(fsp.truncate);
export const unlink = adopted(fsp.unlink);
export const utimes = adopted(fsp.utimes);
export const watch = signalWrapped(fsp.watch, entries.get('watch'), 1);
export const writeFile = promisifySignalWrapped(viaFs('writeFile'), entries.get('writeFile'), 2);

export const Dir = nodeFs.Dir;
export const Dirent = nodeFs.Dirent;
export const Stats = nodeFs.Stats;
export type { BigIntStats, StatsFs as StatFs } from 'node:fs';
export const exists = promisifyWrapped(fsCallbacks.exists);
