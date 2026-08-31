import type { Dir, Dirent, MakeDirectoryOptions, Mode, Stats } from 'node:fs';

import type { CancelablePromise } from '@cancjs/promise';

import * as layer from '../fs';
import * as layerSync from '../fs/sync';

/**
 * Node-shaped views of the file system layer, for the calls this directory makes.
 *
 * Everything here goes through `/fs` rather than `node:fs`, so a registered implementation and the
 * descriptor retry reach the recursive workloads that need them most. The layer's own bindings are
 * variadic, because a wrapper has to accept every overload node has, so node's signature is
 * restated once here and the call sites keep real argument and result types.
 */

/** The data argument node's write calls accept. */
export type TWriteData =
  | string
  | NodeJS.ArrayBufferView
  | Iterable<string | NodeJS.ArrayBufferView>
  | AsyncIterable<string | NodeJS.ArrayBufferView>;

/** The options bag node's file writes accept, or the encoding shorthand in its place. */
export interface IWriteFileOptions {
  encoding?: BufferEncoding | null;
  mode?: Mode;
  flag?: string;
  flush?: boolean;
}

/** The options bag node's file reads accept. */
export interface IReadFileOptions {
  encoding?: BufferEncoding | null;
  flag?: string;
}

/** Options for removing a path and anything under it. */
export interface IRmOptions {
  recursive?: boolean;
  force?: boolean;
}

/**
 * The cancel state a recursive helper carries.
 *
 * `signal` is what a loop checkpoints on between entries. `run` records the call in flight, so a
 * cancel arriving mid-call reaches node instead of waiting for the next checkpoint.
 */
export interface ICancelScope {
  readonly signal: AbortSignal;
  run<T>(call: CancelablePromise<T>): CancelablePromise<T>;
  cancel(reason?: unknown): void;
}

/**
 * Build a cancel scope from a cancelable executor's signal accessor.
 *
 * @param getSignal - The `getSignal` of the owning promise's executor context.
 */
export function cancelScope(getSignal: () => unknown): ICancelScope {
  // the context mints a real AbortController signal, so a helper can checkpoint on it directly
  const signal = getSignal() as AbortSignal;
  let active: CancelablePromise<unknown> | null = null;

  return {
    signal,
    run(call) {
      active = call;
      return call;
    },
    cancel(reason) {
      active?.cancel(reason);
    },
  };
}

export function chmod(path: string, mode: Mode): CancelablePromise<void> {
  return layer.chmod(path, mode) as CancelablePromise<void>;
}

export function chown(path: string, uid: number, gid: number): CancelablePromise<void> {
  return layer.chown(path, uid, gid) as CancelablePromise<void>;
}

export function copyFile(src: string, dest: string, mode: number): CancelablePromise<void> {
  return layer.copyFile(src, dest, mode) as CancelablePromise<void>;
}

export function link(existingPath: string, newPath: string): CancelablePromise<void> {
  return layer.link(existingPath, newPath) as CancelablePromise<void>;
}

export function lstat(path: string): CancelablePromise<Stats> {
  return layer.lstat(path) as CancelablePromise<Stats>;
}

export function mkdir(path: string, options: MakeDirectoryOptions): CancelablePromise<string | undefined> {
  return layer.mkdir(path, options) as CancelablePromise<string | undefined>;
}

export function opendir(path: string): CancelablePromise<Dir> {
  return layer.opendir(path) as CancelablePromise<Dir>;
}

export function readFile(path: string, options?: IReadFileOptions): CancelablePromise<string | Buffer> {
  return layer.readFile(path, options) as CancelablePromise<string | Buffer>;
}

export function readdir(path: string): CancelablePromise<string[]>;
export function readdir(path: string, options: { withFileTypes: true }): CancelablePromise<Dirent[]>;
export function readdir(path: string, options?: { withFileTypes: true }): CancelablePromise<string[] | Dirent[]> {
  const call = options ? layer.readdir(path, options) : layer.readdir(path);
  return call as CancelablePromise<string[] | Dirent[]>;
}

export function readlink(path: string): CancelablePromise<string> {
  return layer.readlink(path) as CancelablePromise<string>;
}

export function rename(oldPath: string, newPath: string): CancelablePromise<void> {
  return layer.rename(oldPath, newPath) as CancelablePromise<void>;
}

export function rm(path: string, options?: IRmOptions): CancelablePromise<void> {
  return layer.rm(path, options) as CancelablePromise<void>;
}

export function stat(path: string): CancelablePromise<Stats> {
  return layer.stat(path) as CancelablePromise<Stats>;
}

export function symlink(target: string, path: string, type?: string): CancelablePromise<void> {
  return layer.symlink(target, path, type) as CancelablePromise<void>;
}

export function unlink(path: string): CancelablePromise<void> {
  return layer.unlink(path) as CancelablePromise<void>;
}

export function writeFile(
  path: string,
  data: TWriteData,
  options?: IWriteFileOptions | BufferEncoding | null,
): CancelablePromise<void> {
  return layer.writeFile(path, data, options) as CancelablePromise<void>;
}

export function lstatSync(path: string): Stats {
  return layerSync.lstatSync(path) as Stats;
}

export function mkdirSync(path: string, options: MakeDirectoryOptions): string | undefined {
  return layerSync.mkdirSync(path, options) as string | undefined;
}

export function opendirSync(path: string): Dir {
  return layerSync.opendirSync(path) as Dir;
}

export function readFileSync(path: string, options?: IReadFileOptions): string | Buffer {
  return layerSync.readFileSync(path, options) as string | Buffer;
}

export function statSync(path: string): Stats {
  return layerSync.statSync(path) as Stats;
}

export function writeFileSync(
  path: string,
  data: TWriteData,
  options?: IWriteFileOptions | BufferEncoding | null,
): void {
  layerSync.writeFileSync(path, data, options);
}
