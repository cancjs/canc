import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

for (const pkg of ['canc-promise', 'canc-toolbox', 'canc-toolbox-native']) {
  if (!fs.existsSync(path.join(repoRoot, 'packages', pkg, 'dist/types/index.d.ts'))) {
    throw new Error('Run "npm run build" before "npm run test:dist"');
  }
}

// every package inlines its own error classes, so only identical emitted types pass
const sameTypeChecks = (left: string, right: string): string => `{
type TSame<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameInstance: TSame<InstanceType<typeof ${left}>, InstanceType<typeof ${right}>> = true;
const _sameClass: TSame<typeof ${left}, typeof ${right}> = true;
const _declared: CancelablePromise<void, InstanceType<typeof ${left}>> =
  null as unknown as CancelablePromise<void, InstanceType<typeof ${right}>>;
void [_sameInstance, _sameClass, _declared];
}`;

function compileConsumer(label: string, source: string): void {
  const consumerPath = path.join(repoRoot, `~~error-identity-${label}.ts`);
  fs.writeFileSync(consumerPath, source, 'utf8');
  const tscBin = path.join(repoRoot, 'node_modules/typescript/bin/tsc');

  try {
    execSync(
      `node "${tscBin}" --noEmit --strict --target es2020 --module node16 --moduleResolution node16 "${consumerPath}"`,
      { cwd: repoRoot, encoding: 'utf8' },
    );
  } catch (err: any) {
    throw new Error(`consumer failed to compile:\n${String(err.stdout)}${String(err.stderr)}`, { cause: err });
  } finally {
    fs.unlinkSync(consumerPath);
  }
}

describe('error class identity across packed declarations', () => {
  it('TimeoutError and AbortError from promise and toolbox are the same type', () => {
    compileConsumer(
      'toolbox',
      `import { AbortError as PAbort, CancelablePromise, TimeoutError as PTimeout } from '@cancjs/promise';
import { AbortError as TAbort, TimeoutError as TTimeout } from '@cancjs/toolbox';
${sameTypeChecks('PTimeout', 'TTimeout')}
${sameTypeChecks('PAbort', 'TAbort')}
`,
    );
  });

  it('TimeoutError and AbortError from promise and the zero-dependency twin are the same type', () => {
    compileConsumer(
      'native',
      `import { AbortError as PAbort, CancelablePromise, TimeoutError as PTimeout } from '@cancjs/promise';
import { AbortError as NAbort, TimeoutError as NTimeout } from '@cancjs/toolbox-native';
${sameTypeChecks('PTimeout', 'NTimeout')}
${sameTypeChecks('PAbort', 'NAbort')}
`,
    );
  });

  it('SupersededError from toolbox and the zero-dependency twin is the same type', () => {
    compileConsumer(
      'superseded',
      `import { CancelablePromise } from '@cancjs/promise';
import { SupersededError as TSuperseded } from '@cancjs/toolbox';
import { SupersededError as NSuperseded } from '@cancjs/toolbox-native';
${sameTypeChecks('TSuperseded', 'NSuperseded')}
`,
    );
  });

  it('distinct error kinds stay distinct types', () => {
    const consumerSource = `import { TimeoutError, AbortError } from '@cancjs/promise';
const _distinct: InstanceType<typeof TimeoutError> = null as unknown as InstanceType<typeof AbortError>;
void _distinct;
`;
    expect(() => compileConsumer('distinct', consumerSource)).toThrow(/TS2322/);
  });
});
