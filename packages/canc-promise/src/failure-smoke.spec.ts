import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { Eq } from '../../../tests-types/fixtures/common/assert-type';
import {
  AbortError,
  CancelablePromise,
  CancelError,
  catchCancel,
  catchErrors,
  createCatchError,
  isAbortError,
} from './index';

class SmokeError extends Error {
  name = 'SmokeError';
  readonly code = 'SMOKE_FAILURE';
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class SecondSmokeError extends Error {
  name = 'SecondSmokeError';
  readonly code = 'SECOND_SMOKE_FAILURE';
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

describe('declared failure smoke coverage', () => {
  it('1. builds real declared-failure promise via executor, rejects with failure, asserts runtime rejection and static type', async () => {
    const p = new CancelablePromise<string, SmokeError>((_resolve, reject) => {
      reject(new SmokeError('smoke failure'));
    });
    p.catch(() => {});

    await expect(p).rejects.toThrow(SmokeError);

    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SmokeError);
    if (caught instanceof SmokeError) {
      const typeCheck: Eq<typeof caught, SmokeError> = true;
      expect(typeCheck).toBe(true);
      expect(caught.code).toBe('SMOKE_FAILURE');
    }
  });

  it('2. chains through then, catch, and finally asserting the failure set at each step', async () => {
    const pOriginal = new CancelablePromise<number, SmokeError>((_resolve, reject) => {
      reject(new SmokeError('chain failure'));
    });
    pOriginal.catch(() => {});

    // 2a. then (value mapping preserves failure set)
    const pThen = pOriginal.then((n) => String(n));
    pThen.catch(() => {});
    const cThen: Eq<typeof pThen, CancelablePromise<string, SmokeError>> = true;
    expect(cThen).toBe(true);

    // 2b. then (returning promise with another failure combines failure sets)
    const pThenCombine = pOriginal.then((_n) => {
      return new CancelablePromise<boolean, SecondSmokeError>((_res, rej) => rej(new SecondSmokeError('second')));
    });

    // 2c. catch (handles failures, resets failure set to never)
    const pCatch = pThenCombine.catch((_err) => {
      const cErr: Eq<typeof _err, SmokeError | SecondSmokeError> = true;
      expect(cErr).toBe(true);
      return false;
    });
    const cCatch: Eq<typeof pCatch, CancelablePromise<boolean, never>> = true;
    expect(cCatch).toBe(true);
    await expect(pCatch).resolves.toBe(false);

    // 2d. finally (preserves failure set)
    const pFinally = pOriginal.finally(() => {});
    const cFinally: Eq<typeof pFinally, CancelablePromise<number, SmokeError>> = true;
    expect(cFinally).toBe(true);
    await expect(pFinally).rejects.toThrow(SmokeError);
  });

  it('3. subtracts through each helper form (inline, factory, catchCancel with { abort: true })', async () => {
    const pCombined = new CancelablePromise<number, SmokeError | SecondSmokeError>((_resolve, reject) => {
      reject(new SmokeError('inline failure'));
    });
    pCombined.catch(() => {});

    // 3a. Inline form (catchErrors)
    const pSubInline = catchErrors(pCombined, SmokeError);
    const cSubInline: Eq<typeof pSubInline, CancelablePromise<number | SmokeError, SecondSmokeError>> = true;
    expect(cSubInline).toBe(true);
    await expect(pSubInline).resolves.toBeInstanceOf(SmokeError);

    // 3b. Factory form (createCatchError)
    const catchSmoke = createCatchError(SmokeError);
    const pSubFactory = catchSmoke(pCombined);
    const cSubFactory: Eq<typeof pSubFactory, CancelablePromise<number | SmokeError, SecondSmokeError>> = true;
    expect(cSubFactory).toBe(true);
    await expect(pSubFactory).resolves.toBeInstanceOf(SmokeError);

    // 3c. catchCancel with { abort: true }
    const pWithAbort = new CancelablePromise<number, SmokeError | AbortError>((_resolve, reject) => {
      reject(new AbortError('aborted'));
    });
    pWithAbort.catch(() => {});
    const pSubCancel = catchCancel(pWithAbort, { abort: true });
    const cSubCancel: Eq<typeof pSubCancel, CancelablePromise<number | CancelError, SmokeError>> = true;
    expect(cSubCancel).toBe(true);
    const resCancel = await pSubCancel;
    expect(isAbortError(resCancel)).toBe(true);
  });

  it('4. build-output check: compiles a consumer file against dist/types verifying type param and FAILURE symbol visibility', () => {
    const distTypesIndex = path.resolve(__dirname, '../dist/types/index.d.ts');
    expect(fs.existsSync(distTypesIndex)).toBe(true);

    const tempConsumerPath = path.resolve(__dirname, '../../../~~smoke-consumer-temp.ts');
    const importPath = distTypesIndex.replace(/\.d\.ts$/, '').replace(/\\/g, '/');
    const tempConsumerCode = `import { CancelablePromise, FAILURE } from '${importPath}';

class ExternalError extends Error {
  name = 'ExternalError';
}

const p: CancelablePromise<number, ExternalError> = null as any;
const f: typeof FAILURE = FAILURE;
void [p, f];
`;
    fs.writeFileSync(tempConsumerPath, tempConsumerCode, 'utf8');

    const tscBin = path.resolve(__dirname, '../../../node_modules/typescript/bin/tsc');
    try {
      execSync(
        `node "${tscBin}" --noEmit --target es2020 --moduleResolution node --skipLibCheck "${tempConsumerPath}"`,
        {
          cwd: path.resolve(__dirname, '../../..'),
          encoding: 'utf8',
        },
      );
    } catch (err: any) {
      if (err.stdout || err.stderr) {
        console.error('TSC OUTPUT:', err.stdout, err.stderr);
      }
      throw err;
    } finally {
      if (fs.existsSync(tempConsumerPath)) {
        fs.unlinkSync(tempConsumerPath);
      }
    }
  });
});
