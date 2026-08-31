import type { Dirent, Stats } from 'node:fs';
import { lstat as fsLstat, opendir as fsOpendir, stat as fsStat } from 'node:fs/promises';
import { join } from 'node:path';

import { lstatSync as fsLstatSync, opendirSync as fsOpendirSync, statSync as fsStatSync } from '../fs/sync';

/**
 * Traversal order for walk operations.
 * - 'breadth-first': yield entries level by level (default).
 * - 'depth-first': yield parent directories before their children (pre-order).
 * - 'children-first': yield children before their parent directory (post-order).
 */
export type TWalkOrder = 'breadth-first' | 'depth-first' | 'children-first';

/**
 * Error handling policy for walk operations.
 * - 'throw': rethrow the error and terminate iteration (default).
 * - 'skip': ignore the error and continue iteration.
 * - 'yield': emit the error as a walk entry with path and error properties.
 */
export type TWalkOnError = 'throw' | 'skip' | 'yield';

/**
 * Walk entry yielded during directory traversal.
 */
export interface IWalkEntry {
  /**
   * Absolute or relative path to the entry.
   */
  path: string;
  /**
   * Dirent instance representing the file system entry (undefined when entry represents a yielded error).
   */
  dirent?: Dirent;
  /**
   * File Stats if stats option is true.
   */
  stats?: Stats;
  /**
   * Error object if onError is 'yield' and an error occurred accessing this entry.
   */
  error?: unknown;
}

/**
 * Options configuring walk and walkSync.
 */
export interface IWalkOptions {
  /**
   * Maximum directory depth to descend into.
   * 0 yields root entries only without descending into subdirectories.
   *
   * @default Infinity
   */
  depth?: number;
  /**
   * Whether to follow symbolic links.
   * When true, cycles are detected and pruned.
   *
   * @default false
   */
  followSymlinks?: boolean;
  /**
   * Traversal order.
   *
   * @default 'breadth-first'
   */
  order?: TWalkOrder;
  /**
   * Error handling mode when reading directories or retrieving stats.
   *
   * @default 'throw'
   */
  onError?: TWalkOnError;
  /**
   * Whether to retrieve Stats for each yielded entry.
   *
   * @default false
   */
  stats?: boolean;
  /**
   * Filter predicate evaluated on Dirent before stat and before descending.
   * Returning false prunes the entry and prevents descending.
   */
  filter?: (entry: { path: string; dirent: Dirent }) => boolean | Promise<boolean>;
  /**
   * Optional custom filesystem methods (used for dependency injection and tests).
   */
  fs?: {
    opendir?: typeof fsOpendir;
    opendirSync?: typeof fsOpendirSync;
    stat?: typeof fsStat;
    statSync?: typeof fsStatSync;
    lstat?: typeof fsLstat;
    lstatSync?: typeof fsLstatSync;
  };
}

interface IQueueItem {
  dirPath: string;
  currentDepth: number;
  visitedDevIno: Set<string>;
}

function getDevInoKey(statObj: Stats): string {
  return String(statObj.dev) + ':' + String(statObj.ino);
}

async function* walkChildrenFirst(
  dirPath: string,
  currentDepth: number,
  depthLimit: number,
  followSymlinks: boolean,
  onError: TWalkOnError,
  needStats: boolean,
  filter: IWalkOptions['filter'],
  visitedDevIno: Set<string>,
  opendirFn: typeof fsOpendir,
  statFn: typeof fsStat,
  lstatFn: typeof fsLstat,
): AsyncGenerator<IWalkEntry, void, unknown> {
  let dirStream;
  try {
    dirStream = await opendirFn(dirPath);
  } catch (err) {
    if (onError === 'throw') {
      throw err;
    }
    if (onError === 'yield') {
      yield { path: dirPath, error: err };
    }
    return;
  }

  const dirents: Dirent[] = [];
  try {
    for await (const d of dirStream) {
      dirents.push(d);
    }
  } catch (err) {
    if (onError === 'throw') {
      throw err;
    }
    if (onError === 'yield') {
      yield { path: dirPath, error: err };
    }
    return;
  }

  for (const d of dirents) {
    const entryPath = join(dirPath, d.name);

    if (filter) {
      let keep: boolean;
      try {
        const res = await filter({ path: entryPath, dirent: d });
        keep = !!res;
      } catch (err) {
        if (onError === 'throw') {
          throw err;
        }
        if (onError === 'yield') {
          yield { path: entryPath, dirent: d, error: err };
        }
        continue;
      }
      if (!keep) {
        continue;
      }
    }

    let isDirectory = d.isDirectory();
    let targetStat: Stats | undefined;

    if (followSymlinks && d.isSymbolicLink()) {
      try {
        targetStat = await statFn(entryPath);
        if (targetStat?.isDirectory()) {
          isDirectory = true;
        }
      } catch (_err) {
        // Dead symlink or unreadable target
      }
    }

    if (isDirectory && currentDepth < depthLimit) {
      let isCycle = false;
      const nextVisited = new Set(visitedDevIno);

      if (followSymlinks) {
        try {
          const dirStat = targetStat ?? (await statFn(entryPath));
          const key = getDevInoKey(dirStat);
          if (nextVisited.has(key)) {
            isCycle = true;
          } else {
            nextVisited.add(key);
          }
        } catch (_err) {
          // Cannot stat directory
        }
      }

      if (!isCycle) {
        yield* walkChildrenFirst(
          entryPath,
          currentDepth + 1,
          depthLimit,
          followSymlinks,
          onError,
          needStats,
          filter,
          nextVisited,
          opendirFn,
          statFn,
          lstatFn,
        );
      }
    }

    let entryStats: Stats | undefined;
    if (needStats) {
      try {
        entryStats = followSymlinks ? (targetStat ?? (await statFn(entryPath))) : await lstatFn(entryPath);
      } catch (err) {
        if (onError === 'throw') {
          throw err;
        }
        if (onError === 'yield') {
          yield { path: entryPath, dirent: d, error: err };
        }
        continue;
      }
    }

    yield {
      path: entryPath,
      dirent: d,
      stats: entryStats,
    };
  }
}

function* walkSyncChildrenFirst(
  dirPath: string,
  currentDepth: number,
  depthLimit: number,
  followSymlinks: boolean,
  onError: TWalkOnError,
  needStats: boolean,
  filter: IWalkOptions['filter'],
  visitedDevIno: Set<string>,
  opendirSyncFn: typeof fsOpendirSync,
  statSyncFn: typeof fsStatSync,
  lstatSyncFn: typeof fsLstatSync,
): Generator<IWalkEntry, void, unknown> {
  let dirHandle;
  try {
    dirHandle = opendirSyncFn(dirPath);
  } catch (err) {
    if (onError === 'throw') {
      throw err;
    }
    if (onError === 'yield') {
      yield { path: dirPath, error: err };
    }
    return;
  }

  const dirents: Dirent[] = [];
  try {
    let d: Dirent | null;
    while ((d = dirHandle.readSync()) !== null) {
      dirents.push(d);
    }
  } catch (err) {
    if (onError === 'throw') {
      throw err;
    }
    if (onError === 'yield') {
      yield { path: dirPath, error: err };
    }
    return;
  } finally {
    try {
      dirHandle.closeSync();
    } catch {
      // ignore
    }
  }

  for (const d of dirents) {
    const entryPath = join(dirPath, d.name);

    if (filter) {
      let keep: boolean;
      try {
        const res = filter({ path: entryPath, dirent: d });
        keep = typeof res === 'boolean' ? res : false;
      } catch (err) {
        if (onError === 'throw') {
          throw err;
        }
        if (onError === 'yield') {
          yield { path: entryPath, dirent: d, error: err };
        }
        continue;
      }
      if (!keep) {
        continue;
      }
    }

    let isDirectory = d.isDirectory();
    let targetStat: Stats | undefined;

    if (followSymlinks && d.isSymbolicLink()) {
      try {
        targetStat = statSyncFn(entryPath);
        if (targetStat?.isDirectory()) {
          isDirectory = true;
        }
      } catch (_err) {
        // Dead symlink or unreadable target
      }
    }

    if (isDirectory && currentDepth < depthLimit) {
      let isCycle = false;
      const nextVisited = new Set(visitedDevIno);

      if (followSymlinks) {
        try {
          const dirStat = targetStat ?? statSyncFn(entryPath);
          const key = getDevInoKey(dirStat);
          if (nextVisited.has(key)) {
            isCycle = true;
          } else {
            nextVisited.add(key);
          }
        } catch (_err) {
          // Cannot stat directory
        }
      }

      if (!isCycle) {
        yield* walkSyncChildrenFirst(
          entryPath,
          currentDepth + 1,
          depthLimit,
          followSymlinks,
          onError,
          needStats,
          filter,
          nextVisited,
          opendirSyncFn,
          statSyncFn,
          lstatSyncFn,
        );
      }
    }

    let entryStats: Stats | undefined;
    if (needStats) {
      try {
        entryStats = followSymlinks ? (targetStat ?? statSyncFn(entryPath)) : lstatSyncFn(entryPath);
      } catch (err) {
        if (onError === 'throw') {
          throw err;
        }
        if (onError === 'yield') {
          yield { path: entryPath, dirent: d, error: err };
        }
        continue;
      }
    }

    yield {
      path: entryPath,
      dirent: d,
      stats: entryStats,
    };
  }
}

/**
 * Asynchronously walks a directory tree, yielding entries according to options.
 *
 * @param dir - Root directory path to start traversal from.
 * @param options - Walk options.
 */
export async function* walk(dir: string, options?: IWalkOptions): AsyncGenerator<IWalkEntry, void, unknown> {
  const depthLimit = options?.depth ?? Infinity;
  const followSymlinks = options?.followSymlinks ?? false;
  const order: TWalkOrder = options?.order ?? 'breadth-first';
  const onError: TWalkOnError = options?.onError ?? 'throw';
  const needStats = options?.stats ?? false;
  const filter = options?.filter;

  const opendirFn = options?.fs?.opendir ?? fsOpendir;
  const statFn = options?.fs?.stat ?? fsStat;
  const lstatFn = options?.fs?.lstat ?? fsLstat;

  const initialVisited = new Set<string>();

  if (followSymlinks) {
    try {
      const rootStat = await statFn(dir);
      initialVisited.add(getDevInoKey(rootStat));
    } catch (err) {
      if (onError === 'throw') {
        throw err;
      }
      if (onError === 'yield') {
        yield { path: dir, error: err };
      }
      return;
    }
  }

  if (order === 'children-first') {
    yield* walkChildrenFirst(
      dir,
      0,
      depthLimit,
      followSymlinks,
      onError,
      needStats,
      filter,
      initialVisited,
      opendirFn,
      statFn,
      lstatFn,
    );
    return;
  }

  const queue: IQueueItem[] = [{ dirPath: dir, currentDepth: 0, visitedDevIno: initialVisited }];

  while (queue.length > 0) {
    const item = order === 'breadth-first' ? queue.shift()! : queue.pop()!;
    const { dirPath, currentDepth, visitedDevIno } = item;

    let dirStream;
    try {
      dirStream = await opendirFn(dirPath);
    } catch (err) {
      if (onError === 'throw') {
        throw err;
      }
      if (onError === 'yield') {
        yield { path: dirPath, error: err };
      }
      continue;
    }

    const dirents: Dirent[] = [];
    try {
      for await (const d of dirStream) {
        dirents.push(d);
      }
    } catch (err) {
      if (onError === 'throw') {
        throw err;
      }
      if (onError === 'yield') {
        yield { path: dirPath, error: err };
      }
      continue;
    }

    const nextQueueItems: IQueueItem[] = [];
    const entriesToYield: IWalkEntry[] = [];

    for (const d of dirents) {
      const entryPath = join(dirPath, d.name);

      if (filter) {
        let keep: boolean;
        try {
          const res = await filter({ path: entryPath, dirent: d });
          keep = !!res;
        } catch (err) {
          if (onError === 'throw') {
            throw err;
          }
          if (onError === 'yield') {
            yield { path: entryPath, dirent: d, error: err };
          }
          continue;
        }
        if (!keep) {
          continue;
        }
      }

      let entryStats: Stats | undefined;
      if (needStats) {
        try {
          entryStats = followSymlinks ? await statFn(entryPath) : await lstatFn(entryPath);
        } catch (err) {
          if (onError === 'throw') {
            throw err;
          }
          if (onError === 'yield') {
            yield { path: entryPath, dirent: d, error: err };
          }
          continue;
        }
      }

      let isDirectory = d.isDirectory();
      let targetStat: Stats | undefined;

      if (followSymlinks && d.isSymbolicLink()) {
        try {
          targetStat = entryStats ?? (await statFn(entryPath));
          if (targetStat?.isDirectory()) {
            isDirectory = true;
          }
        } catch (_err) {
          // Dead symlink or unreadable link target
        }
      }

      const walkEntry: IWalkEntry = {
        path: entryPath,
        dirent: d,
        stats: entryStats,
      };

      entriesToYield.push(walkEntry);

      if (isDirectory && currentDepth < depthLimit) {
        let isCycle = false;
        const nextVisited = new Set(visitedDevIno);

        if (followSymlinks) {
          try {
            const dirStat = targetStat ?? (await statFn(entryPath));
            const key = getDevInoKey(dirStat);
            if (nextVisited.has(key)) {
              isCycle = true;
            } else {
              nextVisited.add(key);
            }
          } catch (_err) {
            // Cannot stat directory
          }
        }

        if (!isCycle) {
          nextQueueItems.push({
            dirPath: entryPath,
            currentDepth: currentDepth + 1,
            visitedDevIno: nextVisited,
          });
        }
      }
    }

    if (order === 'breadth-first') {
      for (const entry of entriesToYield) {
        yield entry;
      }
      for (const nextItem of nextQueueItems) {
        queue.push(nextItem);
      }
    } else if (order === 'depth-first') {
      for (const entry of entriesToYield) {
        yield entry;
      }
      for (let i = nextQueueItems.length - 1; i >= 0; i--) {
        queue.push(nextQueueItems[i]);
      }
    }
  }
}

/**
 * Synchronously walks a directory tree, yielding entries according to options.
 *
 * @param dir - Root directory path to start traversal from.
 * @param options - Walk options.
 */
export function* walkSync(dir: string, options?: IWalkOptions): Generator<IWalkEntry, void, unknown> {
  const depthLimit = options?.depth ?? Infinity;
  const followSymlinks = options?.followSymlinks ?? false;
  const order: TWalkOrder = options?.order ?? 'breadth-first';
  const onError: TWalkOnError = options?.onError ?? 'throw';
  const needStats = options?.stats ?? false;
  const filter = options?.filter;

  const opendirSyncFn = options?.fs?.opendirSync ?? fsOpendirSync;
  const statSyncFn = options?.fs?.statSync ?? fsStatSync;
  const lstatSyncFn = options?.fs?.lstatSync ?? fsLstatSync;

  const initialVisited = new Set<string>();

  if (followSymlinks) {
    try {
      const rootStat = statSyncFn(dir);
      initialVisited.add(getDevInoKey(rootStat));
    } catch (err) {
      if (onError === 'throw') {
        throw err;
      }
      if (onError === 'yield') {
        yield { path: dir, error: err };
      }
      return;
    }
  }

  if (order === 'children-first') {
    yield* walkSyncChildrenFirst(
      dir,
      0,
      depthLimit,
      followSymlinks,
      onError,
      needStats,
      filter,
      initialVisited,
      opendirSyncFn,
      statSyncFn,
      lstatSyncFn,
    );
    return;
  }

  const queue: IQueueItem[] = [{ dirPath: dir, currentDepth: 0, visitedDevIno: initialVisited }];

  while (queue.length > 0) {
    const item = order === 'breadth-first' ? queue.shift()! : queue.pop()!;
    const { dirPath, currentDepth, visitedDevIno } = item;

    let dirHandle;
    try {
      dirHandle = opendirSyncFn(dirPath);
    } catch (err) {
      if (onError === 'throw') {
        throw err;
      }
      if (onError === 'yield') {
        yield { path: dirPath, error: err };
      }
      continue;
    }

    const dirents: Dirent[] = [];
    try {
      let d: Dirent | null;
      while ((d = dirHandle.readSync()) !== null) {
        dirents.push(d);
      }
    } catch (err) {
      if (onError === 'throw') {
        throw err;
      }
      if (onError === 'yield') {
        yield { path: dirPath, error: err };
      }
      continue;
    } finally {
      try {
        dirHandle.closeSync();
      } catch {
        // ignore close error
      }
    }

    const nextQueueItems: IQueueItem[] = [];
    const entriesToYield: IWalkEntry[] = [];

    for (const d of dirents) {
      const entryPath = join(dirPath, d.name);

      if (filter) {
        let keep: boolean;
        try {
          const res = filter({ path: entryPath, dirent: d });
          keep = typeof res === 'boolean' ? res : false;
        } catch (err) {
          if (onError === 'throw') {
            throw err;
          }
          if (onError === 'yield') {
            yield { path: entryPath, dirent: d, error: err };
          }
          continue;
        }
        if (!keep) {
          continue;
        }
      }

      let entryStats: Stats | undefined;
      if (needStats) {
        try {
          entryStats = followSymlinks ? statSyncFn(entryPath) : lstatSyncFn(entryPath);
        } catch (err) {
          if (onError === 'throw') {
            throw err;
          }
          if (onError === 'yield') {
            yield { path: entryPath, dirent: d, error: err };
          }
          continue;
        }
      }

      let isDirectory = d.isDirectory();
      let targetStat: Stats | undefined;

      if (followSymlinks && d.isSymbolicLink()) {
        try {
          targetStat = entryStats ?? statSyncFn(entryPath);
          if (targetStat?.isDirectory()) {
            isDirectory = true;
          }
        } catch (_err) {
          // Dead symlink or unreadable target
        }
      }

      const walkEntry: IWalkEntry = {
        path: entryPath,
        dirent: d,
        stats: entryStats,
      };

      entriesToYield.push(walkEntry);

      if (isDirectory && currentDepth < depthLimit) {
        let isCycle = false;
        const nextVisited = new Set(visitedDevIno);

        if (followSymlinks) {
          try {
            const dirStat = targetStat ?? statSyncFn(entryPath);
            const key = getDevInoKey(dirStat);
            if (nextVisited.has(key)) {
              isCycle = true;
            } else {
              nextVisited.add(key);
            }
          } catch (_err) {
            // Cannot stat directory
          }
        }

        if (!isCycle) {
          nextQueueItems.push({
            dirPath: entryPath,
            currentDepth: currentDepth + 1,
            visitedDevIno: nextVisited,
          });
        }
      }
    }

    if (order === 'breadth-first') {
      for (const entry of entriesToYield) {
        yield entry;
      }
      for (const nextItem of nextQueueItems) {
        queue.push(nextItem);
      }
    } else if (order === 'depth-first') {
      for (const entry of entriesToYield) {
        yield entry;
      }
      for (let i = nextQueueItems.length - 1; i >= 0; i--) {
        queue.push(nextQueueItems[i]);
      }
    }
  }
}
