import * as fs from 'node:fs';

import { getFs } from './registry';
import { TNodeFn, TSignatures } from './wrap';

/**
 * Route one call through the registered implementation, resolved per call so a later `setFs` still
 * takes effect. Nothing here is cancelable, so the published type is node's own.
 */
function route<TName extends keyof typeof fs>(name: TName): (typeof fs)[TName] {
  return ((...args: unknown[]) => (getFs()[name] as TNodeFn)(...args)) as (typeof fs)[TName];
}

export const accessSync = route('accessSync');
export const appendFileSync = route('appendFileSync');
export const chmodSync = route('chmodSync');
export const chownSync = route('chownSync');
export const closeSync = route('closeSync');
export const copyFileSync = route('copyFileSync');
export const cpSync = route('cpSync');
export const existsSync = route('existsSync');
export const fchmodSync = route('fchmodSync');
export const fchownSync = route('fchownSync');
export const fdatasyncSync = route('fdatasyncSync');
export const fstatSync = route('fstatSync');
export const fsyncSync = route('fsyncSync');
export const ftruncateSync = route('ftruncateSync');
export const futimesSync = route('futimesSync');
export const lchmodSync = route('lchmodSync');
export const lchownSync = route('lchownSync');
export const linkSync = route('linkSync');
export const lstatSync = route('lstatSync');
export const lutimesSync = route('lutimesSync');
export const mkdirSync = route('mkdirSync');
export const mkdtempSync = route('mkdtempSync');
export const openSync = route('openSync');
export const opendirSync = route('opendirSync');
export const readFileSync = route('readFileSync');
export const readdirSync = route('readdirSync');
export const readlinkSync = route('readlinkSync');
export const readSync = route('readSync');
export const readvSync = route('readvSync');
// node merges a `native` member onto realpathSync that this surface does not carry, so the binding
// takes the call signatures alone
export const realpathSync: TSignatures<typeof fs.realpathSync> = route('realpathSync');
export const renameSync = route('renameSync');
export const rmSync = route('rmSync');
export const rmdirSync = route('rmdirSync');
export const statSync = route('statSync');
export const statfsSync = route('statfsSync');
export const symlinkSync = route('symlinkSync');
export const truncateSync = route('truncateSync');
export const unlinkSync = route('unlinkSync');
export const utimesSync = route('utimesSync');
export const writeFileSync = route('writeFileSync');
export const writeSync = route('writeSync');
export const writevSync = route('writevSync');

export const Dirent = fs.Dirent;
export const Dir = fs.Dir;
export const Stats = fs.Stats;
export const constants = fs.constants;
