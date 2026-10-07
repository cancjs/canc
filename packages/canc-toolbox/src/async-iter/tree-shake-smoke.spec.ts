import nodeResolve from '@rollup/plugin-node-resolve';
import * as fs from 'fs';
import * as path from 'path';
import { rollup } from 'rollup';
import * as ts from 'typescript';

import { PIPE_OP_BRAND, TERM_OP_BRAND } from '../../../_toolbox/async-iter';
import * as asyncIter from './index';

async function bundleAsyncIter(entrySource: string): Promise<string> {
  const entryPath = path.resolve(__dirname, 'virtual-tree-shake-entry.ts');
  const bundle = await rollup({
    input: entryPath,
    external: ['@cancjs/promise'],
    plugins: [
      {
        name: 'virtual-tree-shake-entry',
        resolveId(id) {
          if (id === entryPath) {
            return id;
          }
          return null;
        },
        load(id) {
          if (id === entryPath) {
            return entrySource;
          }
          return null;
        },
      },
      nodeResolve({ extensions: ['.ts', '.js'] }),
      {
        name: 'transpile-ts',
        transform(code, id) {
          if (id.endsWith('.ts')) {
            const res = ts.transpileModule(code, {
              compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2020,
                removeComments: true,
              },
            });
            return { code: res.outputText, map: null };
          }
          return null;
        },
      },
    ],
  });

  const { output } = await bundle.generate({ format: 'esm' });
  return output[0].code;
}

describe('async-iter tree-shaking', () => {
  it('all pipeable operators are branded with PIPE_OP_BRAND', () => {
    expect((asyncIter.map((x: number) => x) as any)[PIPE_OP_BRAND]).toBe(true);
    expect((asyncIter.filter((_: number) => true) as any)[PIPE_OP_BRAND]).toBe(true);
    expect((asyncIter.take(1) as any)[PIPE_OP_BRAND]).toBe(true);
    expect((asyncIter.drop(1) as any)[PIPE_OP_BRAND]).toBe(true);
    expect((asyncIter.flatMap((x: number) => [x]) as any)[PIPE_OP_BRAND]).toBe(true);
  });

  it('all terminal operators are branded with TERM_OP_BRAND', () => {
    expect((asyncIter.toArray() as any)[TERM_OP_BRAND]).toBe(true);
    expect((asyncIter.reduce((_a: number, b: number) => b) as any)[TERM_OP_BRAND]).toBe(true);
    expect((asyncIter.find((_: number) => true) as any)[TERM_OP_BRAND]).toBe(true);
    expect((asyncIter.some((_: number) => true) as any)[TERM_OP_BRAND]).toBe(true);
    expect((asyncIter.every((_: number) => true) as any)[TERM_OP_BRAND]).toBe(true);
    expect((asyncIter.forEach((_: number) => {}) as any)[TERM_OP_BRAND]).toBe(true);
    expect((asyncIter.includes(1) as any)[TERM_OP_BRAND]).toBe(true);
  });

  it('async-iter declares sideEffects:false in package.json', () => {
    const packageJsonPath = path.resolve(__dirname, '../..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(packageJson.sideEffects).toBe(false);
  });

  it('operators can be selectively imported and used', () => {
    const mapOp = asyncIter.map((x: number) => x * 2);
    const toArrayOp = asyncIter.toArray<number>();

    expect(typeof mapOp).toBe('function');
    expect(typeof toArrayOp).toBe('function');

    const result = asyncIter.pipe(asyncIter.from([1, 2, 3]), [mapOp]);
    expect(asyncIter.isPipeable(result)).toBe(true);
  });

  it('pipeable result from operators can be identified and further piped', async () => {
    const piped = asyncIter.pipe([1, 2, 3], [asyncIter.map((x: number) => x * 2)]);

    expect(asyncIter.isPipeable(piped)).toBe(true);

    const rechained = piped.pipe([asyncIter.filter((x: number) => x > 2)], asyncIter.toArray());
    expect(rechained).toBeDefined();
    const result = await rechained;
    expect(result).toEqual([4, 6]);
  });

  // in-process bundle takes ~0.3 s alone, measured up to 6 s under parallel CPU load
  it('bundles only imported operators and leaves unused flatMap out of the bundle', async () => {
    const output = await bundleAsyncIter(`
      import { filter, map, take } from './index';
      export const used = [map, filter, take];
    `);

    expect(/\bflatMap\b/.test(output)).toBe(false);
    expect(/\bdrop\b/.test(output)).toBe(false);
    expect(/\bmap\b/.test(output)).toBe(true);
    expect(/\bfilter\b/.test(output)).toBe(true);
    expect(/\btake\b/.test(output)).toBe(true);
  }, 30_000);
});
