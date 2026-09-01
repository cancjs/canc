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
  passthrough,
  promisifySignalWrapped,
  promisifyWrapped,
  TCancelable,
  teardownWrapped,
  TNodeFn,
  TSignatures,
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

/**
 * A temporary directory handle, for a runtime newer than the installed node typings describe.
 *
 * The member arrived in node 24.4. Typings older than that carry no declaration to derive from, so
 * this stands in until the consumer installs typings that do.
 */
interface IDisposableTempDir {
  readonly path: string;
  remove(): Promise<void>;
}

type TFsPromises = typeof nodeFsPromises;

/**
 * The declaration for a member the installed node typings may predate, or a stand-in.
 *
 * The condition is left unresolved in the emitted declarations, so it answers against the typings
 * the consumer installed rather than the ones this package was built with. A consumer on node 22
 * typings gets node's own `glob` signature; one on node 20 gets the stand-in.
 */
type TWhenTyped<TName extends string, TFallback> = TFsPromises extends Record<TName, infer TFn> ? TFn : TFallback;

type TGlobFn = TWhenTyped<
  'glob',
  (
    pattern: string | readonly string[],
    options?: { cwd?: string; exclude?: (path: string) => boolean; withFileTypes?: boolean },
  ) => AsyncIterable<string>
>;

type TMkdtempDisposableFn = TWhenTyped<
  'mkdtempDisposable',
  (
    prefix: string,
    options?: { encoding?: BufferEncoding | null } | BufferEncoding | null,
  ) => Promise<IDisposableTempDir>
>;

export const access = adopted(fsp.access) as TCancelable<TFsPromises['access']>;
export const appendFile = promisifySignalWrapped(viaFs('appendFile'), entries.get('appendFile'), 2) as TCancelable<
  TFsPromises['appendFile']
>;
export const chmod = promisifyWrapped(viaFs('chmod')) as TCancelable<TFsPromises['chmod']>;
export const chown = promisifyWrapped(viaFs('chown')) as TCancelable<TFsPromises['chown']>;
export const constants = nodeFsPromises.constants;
// node takes no signal here and cancel does not undo: a canceled copy leaves what node had written,
// exactly as an interrupted node copy does. Unlinking dest would delete a file the caller named as a
// target, not as something to remove, and it was theirs before the copy started
export const copyFile = promisifyWrapped(viaFs('copyFile')) as TCancelable<TFsPromises['copyFile']>;
export const cp = adopted(fsp.cp) as TCancelable<TFsPromises['cp']>;
export const glob = gatedWrapped(
  features.hasGlob,
  'glob',
  '22',
  passthrough(fsp.glob),
) as unknown as TSignatures<TGlobFn>;
export const lchmod = promisifyWrapped(viaFs('lchmod')) as TCancelable<TFsPromises['lchmod']>;
export const lchown = promisifyWrapped(viaFs('lchown')) as TCancelable<TFsPromises['lchown']>;
export const link = adopted(fsp.link) as TCancelable<TFsPromises['link']>;
export const lstat = promisifySignalWrapped(viaFs('lstat'), entries.get('lstat'), 1) as TCancelable<
  TFsPromises['lstat']
>;
export const lutimes = adopted(fsp.lutimes) as TCancelable<TFsPromises['lutimes']>;
export const mkdir = adopted(fsp.mkdir) as TCancelable<TFsPromises['mkdir']>;
export const mkdtemp = adopted(fsp.mkdtemp) as TCancelable<TFsPromises['mkdtemp']>;
export const mkdtempDisposable = gatedWrapped(
  features.hasMkdtempDisposable,
  'mkdtempDisposable',
  '24.4.0',
  adopted(fsp.mkdtempDisposable),
) as unknown as TCancelable<TMkdtempDisposableFn>;
export const open = teardownWrapped(
  (...args: unknown[]) => retryOpen(() => viaFsPromises('open')(...args)).then(decorate),
  closeQuietly,
) as TCancelable<TFsPromises['open']>;
export const opendir = teardownWrapped(
  (...args: unknown[]) => retryOpen(() => viaFsPromises('opendir')(...args)),
  closeQuietly,
) as TCancelable<TFsPromises['opendir']>;
export const readFile = promisifySignalWrapped(viaFs('readFile'), entries.get('readFile'), 1) as TCancelable<
  TFsPromises['readFile']
>;
export const readdir = promisifyWrapped(viaFs('readdir')) as TCancelable<TFsPromises['readdir']>;
export const readlink = adopted(fsp.readlink) as TCancelable<TFsPromises['readlink']>;
export const realpath = adopted(fsp.realpath) as TCancelable<TFsPromises['realpath']>;
export const rename = promisifyWrapped(viaFs('rename')) as TCancelable<TFsPromises['rename']>;
export const rm = adopted(fsp.rm) as TCancelable<TFsPromises['rm']>;
export const rmdir = adopted(fsp.rmdir) as TCancelable<TFsPromises['rmdir']>;
export const stat = promisifySignalWrapped(viaFs('stat'), entries.get('stat'), 1) as TCancelable<TFsPromises['stat']>;
export const statfs = adopted(fsp.statfs) as TCancelable<TFsPromises['statfs']>;
export const symlink = adopted(fsp.symlink) as TCancelable<TFsPromises['symlink']>;
export const truncate = adopted(fsp.truncate) as TCancelable<TFsPromises['truncate']>;
export const unlink = adopted(fsp.unlink) as TCancelable<TFsPromises['unlink']>;
export const utimes = adopted(fsp.utimes) as TCancelable<TFsPromises['utimes']>;
export const watch = passthrough(fsp.watch) as unknown as TSignatures<TFsPromises['watch']>;
export const writeFile = promisifySignalWrapped(viaFs('writeFile'), entries.get('writeFile'), 2) as TCancelable<
  TFsPromises['writeFile']
>;

export const Dir = nodeFs.Dir;
export const Dirent = nodeFs.Dirent;
export const Stats = nodeFs.Stats;
export type { BigIntStats, StatsFs as StatFs } from 'node:fs';
export const exists = promisifyWrapped(fsCallbacks.exists) as TCancelable<typeof nodeFs.exists.__promisify__>;
