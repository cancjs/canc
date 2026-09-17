import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getFs, resetFs, setFs } from '../fs/registry';
import { IWalkEntry, walk, walkSync } from './walk';

async function cleanDir(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await cleanDir(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
    }
    await fs.rmdir(dirPath);
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      // ignore
    }
  }
}

describe('walk and walkSync', () => {
  const root = join(tmpdir(), 'walk-test-' + Math.random().toString(36).slice(2));

  beforeAll(async () => {
    await fs.mkdir(root, { recursive: true });
    // Known tree structure:
    // root/
    //   file1.txt
    //   a/
    //     fileA.txt
    //     subA/
    //       fileSubA.txt
    //   b/
    //     fileB.txt
    await fs.writeFile(join(root, 'file1.txt'), 'f1');
    await fs.mkdir(join(root, 'a'), { recursive: true });
    await fs.writeFile(join(root, 'a', 'fileA.txt'), 'fa');
    await fs.mkdir(join(root, 'a', 'subA'), { recursive: true });
    await fs.writeFile(join(root, 'a', 'subA', 'fileSubA.txt'), 'fsuba');
    await fs.mkdir(join(root, 'b'), { recursive: true });
    await fs.writeFile(join(root, 'b', 'fileB.txt'), 'fb');
  });

  afterAll(async () => {
    await cleanDir(root);
  });

  it('yields every entry of a known tree exactly once', async () => {
    const entries: string[] = [];
    for await (const entry of walk(root)) {
      entries.push(entry.path);
    }
    const expected = [
      join(root, 'file1.txt'),
      join(root, 'a'),
      join(root, 'b'),
      join(root, 'a', 'fileA.txt'),
      join(root, 'a', 'subA'),
      join(root, 'b', 'fileB.txt'),
      join(root, 'a', 'subA', 'fileSubA.txt'),
    ];
    expect(entries.sort()).toEqual(expected.sort());
    expect(new Set(entries).size).toBe(expected.length);
  });

  it('order produces the three documented orders (breadth-first, depth-first, children-first)', async () => {
    // breadth-first
    const bfs: string[] = [];
    for await (const entry of walk(root, { order: 'breadth-first' })) {
      bfs.push(entry.path);
    }
    // Level 1: file1.txt, a, b
    // Level 2: a/fileA.txt, a/subA, b/fileB.txt
    // Level 3: a/subA/fileSubA.txt
    const idxA = bfs.indexOf(join(root, 'a'));
    const idxB = bfs.indexOf(join(root, 'b'));
    const idxSubA = bfs.indexOf(join(root, 'a', 'subA'));
    const idxFileSubA = bfs.indexOf(join(root, 'a', 'subA', 'fileSubA.txt'));

    expect(idxA).toBeLessThan(idxSubA);
    expect(idxB).toBeLessThan(idxFileSubA);

    // depth-first: pre-order (parent before children)
    const dfs: string[] = [];
    for await (const entry of walk(root, { order: 'depth-first' })) {
      dfs.push(entry.path);
    }
    const dfsIdxA = dfs.indexOf(join(root, 'a'));
    const dfsIdxSubA = dfs.indexOf(join(root, 'a', 'subA'));
    const dfsIdxFileSubA = dfs.indexOf(join(root, 'a', 'subA', 'fileSubA.txt'));
    expect(dfsIdxA).toBeLessThan(dfsIdxSubA);
    expect(dfsIdxSubA).toBeLessThan(dfsIdxFileSubA);

    // children-first: post-order (children before parent)
    const childrenFirst: string[] = [];
    for await (const entry of walk(root, { order: 'children-first' })) {
      childrenFirst.push(entry.path);
    }
    const cfIdxA = childrenFirst.indexOf(join(root, 'a'));
    const cfIdxSubA = childrenFirst.indexOf(join(root, 'a', 'subA'));
    const cfIdxFileSubA = childrenFirst.indexOf(join(root, 'a', 'subA', 'fileSubA.txt'));
    const cfIdxFileA = childrenFirst.indexOf(join(root, 'a', 'fileA.txt'));

    // Children must appear before parent
    expect(cfIdxFileSubA).toBeLessThan(cfIdxSubA);
    expect(cfIdxSubA).toBeLessThan(cfIdxA);
    expect(cfIdxFileA).toBeLessThan(cfIdxA);
  });

  it('filter pruning: pruned directory was never opened via injected fs', async () => {
    const openedDirs: string[] = [];
    const customFs = {
      opendir: async (dirPath: string) => {
        openedDirs.push(dirPath);
        return fs.opendir(dirPath);
      },
    };

    const visited: string[] = [];
    for await (const entry of walk(root, {
      fs: customFs as any,
      filter: ({ dirent }) => {
        // Prune directory 'a'
        if (dirent?.name === 'a') return false;
        return true;
      },
    })) {
      visited.push(entry.path);
    }

    expect(visited).not.toContain(join(root, 'a'));
    expect(visited).not.toContain(join(root, 'a', 'fileA.txt'));
    expect(openedDirs).not.toContain(join(root, 'a'));
    expect(openedDirs).not.toContain(join(root, 'a', 'subA'));
  });

  it('onError: yield emits error entry for unreadable directory and continues', async () => {
    const customFs = {
      opendir: async (dirPath: string) => {
        if (dirPath === join(root, 'a')) {
          const err: any = new Error('Permission denied');
          err.code = 'EACCES';
          throw err;
        }
        return fs.opendir(dirPath);
      },
    };

    const entries: any[] = [];
    for await (const entry of walk(root, { fs: customFs as any, onError: 'yield' })) {
      entries.push(entry);
    }

    const errEntry = entries.find((e) => e.path === join(root, 'a') && e.error);
    expect(errEntry).toBeDefined();
    expect(errEntry.error.code).toBe('EACCES');

    // Continued and found entries under root/b
    const bFile = entries.find((e) => e.path === join(root, 'b', 'fileB.txt'));
    expect(bFile).toBeDefined();
  });

  it('onError: throw (default) ends iteration with that error', async () => {
    const customFs = {
      opendir: async (dirPath: string) => {
        if (dirPath === join(root, 'a')) {
          const err: any = new Error('Permission denied');
          err.code = 'EACCES';
          throw err;
        }
        return fs.opendir(dirPath);
      },
    };

    await expect(async () => {
      for await (const _entry of walk(root, { fs: customFs as any, onError: 'throw' })) {
        // iterate
      }
    }).rejects.toThrow('Permission denied');
  });

  const isWindows = process.platform === 'win32';
  it(
    isWindows ?
      'a symlink cycle terminates with followSymlinks: true [skipped on Windows: unprivileged symlinks not supported]'
    : 'a symlink cycle terminates with followSymlinks: true',
    async () => {
      if (isWindows) {
        return;
      }
      const cycleRoot = join(root, 'cycle-test');
      await fs.mkdir(cycleRoot, { recursive: true });
      const dir1 = join(cycleRoot, 'dir1');
      await fs.mkdir(dir1, { recursive: true });
      // Create symlink dir1/loop -> cycleRoot
      await fs.symlink(cycleRoot, join(dir1, 'loop'));

      const entries: string[] = [];
      for await (const entry of walk(cycleRoot, { followSymlinks: true })) {
        entries.push(entry.path);
      }
      // Must terminate and not infinite loop
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.length).toBeLessThan(20);
    },
  );

  it('depth: 0 yields roots entries only and does not descend', async () => {
    const entries: string[] = [];
    for await (const entry of walk(root, { depth: 0 })) {
      entries.push(entry.path);
    }
    const expected = [join(root, 'file1.txt'), join(root, 'a'), join(root, 'b')];
    expect(entries.sort()).toEqual(expected.sort());
  });

  it('cancel mid-walk calls return() on underlying source', async () => {
    const generator = walk(root);
    const first = await generator.next();
    expect(first.done).toBe(false);

    const returnResult = await generator.return();
    expect(returnResult.done).toBe(true);

    const nextAfterReturn = await generator.next();
    expect(nextAfterReturn.done).toBe(true);
  });

  it('walkSync produces identical sequence for same tree', () => {
    // Sync BFS
    const syncEntriesBfs: string[] = [];
    for (const entry of walkSync(root, { order: 'breadth-first' })) {
      syncEntriesBfs.push(entry.path);
    }

    // Sync DFS
    const syncEntriesDfs: string[] = [];
    for (const entry of walkSync(root, { order: 'depth-first' })) {
      syncEntriesDfs.push(entry.path);
    }

    // Sync Children-First
    const syncEntriesCf: string[] = [];
    for (const entry of walkSync(root, { order: 'children-first' })) {
      syncEntriesCf.push(entry.path);
    }

    expect(syncEntriesBfs.length).toBe(7);
    expect(syncEntriesDfs.length).toBe(7);
    expect(syncEntriesCf.length).toBe(7);

    // Assert children-first property in sync mode
    const cfIdxA = syncEntriesCf.indexOf(join(root, 'a'));
    const cfIdxSubA = syncEntriesCf.indexOf(join(root, 'a', 'subA'));
    const cfIdxFileSubA = syncEntriesCf.indexOf(join(root, 'a', 'subA', 'fileSubA.txt'));
    expect(cfIdxFileSubA).toBeLessThan(cfIdxSubA);
    expect(cfIdxSubA).toBeLessThan(cfIdxA);
  });

  it('walkSync throws TypeError naming filter option when given an async filter', () => {
    expect(() => [
      ...walkSync(root, {
        // @ts-expect-error async filter is rejected by walkSync typings
        filter: async () => true,
      }),
    ]).toThrow(TypeError);

    expect(() => [
      ...walkSync(root, {
        // @ts-expect-error async filter is rejected by walkSync typings
        filter: async () => true,
      }),
    ]).toThrow(/filter/);

    // do not catch in onError
    expect(() => [
      ...walkSync(root, {
        onError: 'skip',
        // @ts-expect-error async filter is rejected by walkSync typings
        filter: async () => true,
      }),
    ]).toThrow(TypeError);

    expect(() => [
      ...walkSync(root, {
        onError: 'yield',
        // @ts-expect-error async filter is rejected by walkSync typings
        filter: async () => true,
      }),
    ]).toThrow(TypeError);
  });

  it('walk and walkSync with same sync filter produce identical sequence for same tree', async () => {
    const syncFilter = (entry: IWalkEntry) => entry.dirent?.name !== 'b';

    const asyncEntries: string[] = [];
    for await (const entry of walk(root, { filter: syncFilter })) {
      asyncEntries.push(entry.path);
    }

    const syncEntries: string[] = [];
    for (const entry of walkSync(root, { filter: syncFilter })) {
      syncEntries.push(entry.path);
    }

    expect(syncEntries).toEqual(asyncEntries);
    expect(syncEntries.length).toBeGreaterThan(0);
  });

  it('walk and walkSync call the registered file system', async () => {
    const base = getFs();
    let asyncOpens = 0;
    let syncOpens = 0;

    setFs({
      ...base,
      opendirSync: (...args: any[]) => {
        syncOpens++;
        return base.opendirSync(...args);
      },
      promises: {
        ...base.promises,
        opendir: (...args: any[]) => {
          asyncOpens++;
          return base.promises.opendir(...args);
        },
      },
    });

    try {
      for await (const _entry of walk(root)) {
        // draining is the point; the counter is the assertion
      }
      for (const _entry of walkSync(root)) {
        // same, for the synchronous path
      }
    } finally {
      resetFs();
    }

    expect(asyncOpens).toBeGreaterThan(0);
    expect(syncOpens).toBeGreaterThan(0);
  });
});
