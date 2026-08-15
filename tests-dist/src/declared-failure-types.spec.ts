import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const distTypesIndex = path.resolve(__dirname, '../../packages/canc-promise/dist/types/index.d.ts');

if (!fs.existsSync(distTypesIndex)) {
  throw new Error('Run "npm run build" before "npm run test:dist"');
}

describe('declared failure smoke coverage', () => {
  it('build-output check: compiles a consumer file against dist/types verifying type param and FAILURE symbol visibility', () => {
    const tempConsumerPath = path.resolve(__dirname, '../../~~smoke-consumer-temp.ts');
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

    const tscBin = path.resolve(__dirname, '../../node_modules/typescript/bin/tsc');
    try {
      execSync(
        `node "${tscBin}" --noEmit --target es2020 --moduleResolution node --skipLibCheck "${tempConsumerPath}"`,
        {
          cwd: path.resolve(__dirname, '../..'),
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
