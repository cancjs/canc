import { basename, dirname, parse, resolve, sep } from 'node:path';

import { lstat, stat } from '@cancjs/node/fs';
import { lstatSync, statSync } from '@cancjs/node/fs/sync';

import { isNotFoundError } from '../errors/errno';

/**
 * Shape of an abort signal provided by cancelable-promise or the platform.
 */
export interface IAbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

/**
 * Throws the signal reason if the signal has been aborted.
 *
 * @param signal - Abort signal to check.
 */
export function throwIfAborted(signal: IAbortSignalLike): void {
  if (signal.aborted) {
    throw signal.reason;
  }
}

/** Subset of `BigIntStats` the path guards compare. */
interface IIdentityStats {
  readonly ino: bigint;
  readonly dev: bigint;
  isDirectory(): boolean;
}

export type TGuardedOperation = 'copy' | 'move';

export interface IPathCheck {
  readonly srcStat: IIdentityStats;
  readonly destStat: IIdentityStats | null;
  /** True when move only changes the case of the name on a case-insensitive volume. */
  readonly isChangingCase: boolean;
}

/** Windows can report `dev` as 0n, so equal inode and equal dev is the best identity available. */
export function areIdentical(srcStat: IIdentityStats, destStat: IIdentityStats): boolean {
  return destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
}

/** String-only check, so it also catches a destination that does not exist yet. */
export function isSrcSubdir(src: string, dest: string): boolean {
  const srcParts = resolve(src).split(sep).filter(Boolean);
  const destParts = resolve(dest).split(sep).filter(Boolean);
  return srcParts.every((part, index) => destParts[index] === part);
}

function subdirMessage(src: string, dest: string, operation: TGuardedOperation): string {
  return `Cannot ${operation} '${src}' to a subdirectory of itself, '${dest}'.`;
}

function judge(
  src: string,
  dest: string,
  operation: TGuardedOperation,
  srcStat: IIdentityStats,
  destStat: IIdentityStats | null,
): IPathCheck {
  if (destStat) {
    if (areIdentical(srcStat, destStat)) {
      const srcName = basename(src);
      const destName = basename(dest);
      if (operation === 'move' && srcName !== destName && srcName.toLowerCase() === destName.toLowerCase()) {
        return { srcStat, destStat, isChangingCase: true };
      }
      throw new Error('Source and destination must not be the same.');
    }
    if (srcStat.isDirectory() && !destStat.isDirectory()) {
      throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
    }
    if (!srcStat.isDirectory() && destStat.isDirectory()) {
      throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
    }
  }
  if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
    throw new Error(subdirMessage(src, dest, operation));
  }
  return { srcStat, destStat, isChangingCase: false };
}

/**
 * Rejects a copy or move that would land on itself or inside its own source directory.
 * Messages match fs-extra.
 */
export async function checkPaths(
  src: string,
  dest: string,
  operation: TGuardedOperation,
  signal: IAbortSignalLike,
): Promise<IPathCheck> {
  const options = { bigint: true as const, signal };
  const srcStat = await lstat(src, options);
  const destStat: IIdentityStats | null = await lstat(dest, options).catch((err: unknown) => {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  });
  throwIfAborted(signal);
  const check = judge(src, dest, operation, srcStat, destStat);
  await checkParentPaths(src, srcStat, dest, operation, signal);
  return check;
}

export function checkPathsSync(src: string, dest: string, operation: TGuardedOperation): IPathCheck {
  const srcStat = lstatSync(src, { bigint: true });
  let destStat: IIdentityStats | null = null;
  try {
    destStat = lstatSync(dest, { bigint: true });
  } catch (err: unknown) {
    if (!isNotFoundError(err)) {
      throw err;
    }
  }
  const check = judge(src, dest, operation, srcStat, destStat);
  checkParentPathsSync(src, srcStat, dest, operation);
  return check;
}

/**
 * Walks the destination ancestors comparing inodes, which catches a symlink or junction that leads
 * back into the source tree. Missing ancestors are skipped, a deeper one may still match.
 */
async function checkParentPaths(
  src: string,
  srcStat: IIdentityStats,
  dest: string,
  operation: TGuardedOperation,
  signal: IAbortSignalLike,
): Promise<void> {
  const srcParent = resolve(dirname(src));
  let destParent = resolve(dirname(dest));
  while (destParent !== srcParent && destParent !== parse(destParent).root) {
    let destStat: IIdentityStats | null = null;
    try {
      destStat = await stat(destParent, { bigint: true });
    } catch (err: unknown) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }
    throwIfAborted(signal);
    if (destStat && areIdentical(srcStat, destStat)) {
      throw new Error(subdirMessage(src, dest, operation));
    }
    destParent = resolve(dirname(destParent));
  }
}

function checkParentPathsSync(src: string, srcStat: IIdentityStats, dest: string, operation: TGuardedOperation): void {
  const srcParent = resolve(dirname(src));
  let destParent = resolve(dirname(dest));
  while (destParent !== srcParent && destParent !== parse(destParent).root) {
    let destStat: IIdentityStats | null = null;
    try {
      destStat = statSync(destParent, { bigint: true });
    } catch (err: unknown) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }
    if (destStat && areIdentical(srcStat, destStat)) {
      throw new Error(subdirMessage(src, dest, operation));
    }
    destParent = resolve(dirname(destParent));
  }
}
