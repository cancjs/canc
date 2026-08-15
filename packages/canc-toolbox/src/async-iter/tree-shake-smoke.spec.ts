/**
 * Tree-shake smoke test: verifies that async-iter operators are properly branded and
 * that the package has sideEffects:false to enable tree-shaking.
 *
 * Tests that individual operators can be imported and used independently, and that
 * the module structure supports dropping unused operators during bundling.
 */

import * as fs from 'fs';
import * as path from 'path';

import { PIPE_OP_BRAND, TERM_OP_BRAND } from '../../../_toolbox/async-iter';
import * as asyncIter from './index';

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
    // Check that canc-toolbox has sideEffects: false
    const packageJsonPath = path.resolve(__dirname, '../..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(packageJson.sideEffects).toBe(false);
  });

  it('operators can be selectively imported and used', () => {
    // Test that we can import specific operators without needing the full surface
    const mapOp = asyncIter.map((x: number) => x * 2);
    const toArrayOp = asyncIter.toArray<number>();

    expect(typeof mapOp).toBe('function');
    expect(typeof toArrayOp).toBe('function');

    // They should work together in a pipe
    const result = asyncIter.pipe(asyncIter.from([1, 2, 3]), [mapOp]);
    expect(asyncIter.isPipeable(result)).toBe(true);
  });

  it('pipeable result from operators can be identified and further piped', async () => {
    const piped = asyncIter.pipe([1, 2, 3], [asyncIter.map((x: number) => x * 2)]);

    // Should be pipeable, allowing further chaining
    expect(asyncIter.isPipeable(piped)).toBe(true);

    // Should be able to pipe again
    const rechained = piped.pipe([asyncIter.filter((x: number) => x > 2)], asyncIter.toArray());
    expect(rechained).toBeDefined();
    const result = await rechained;
    expect(result).toEqual([4, 6]);
  });
});
