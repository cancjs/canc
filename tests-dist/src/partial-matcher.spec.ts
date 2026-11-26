import { execFileSync } from 'child_process';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const body = `
  class Missing extends Error {}
  class Forbidden extends Error {}
  const matched = new Missing('yes');
  const unmatched = new Missing('no');
  const other = new Forbidden('yes');
  const partial = createIsError((error) => error instanceof Missing && error.message === 'yes');
  assert.equal(await suppressErrors(CP.fail(matched), partial), undefined);
  assert.equal(await catchErrors(CP.fail(matched), partial), matched);
  assert.equal(await createSuppressError(partial)(CP.fail(matched)), undefined);
  assert.equal(await createCatchError(partial)(CP.fail(matched)), matched);
  for (const reason of [unmatched, other]) {
    for (const consume of [
      (promise) => suppressErrors(promise, partial),
      (promise) => catchErrors(promise, partial),
      createSuppressError(partial),
      createCatchError(partial),
    ]) {
      await assert.rejects(Promise.resolve(consume(CP.fail(reason))), (error) => error === reason);
    }
  }
  const mixed = createIsError(Forbidden, (error) => error === matched);
  assert.equal(mixed(other), true);
  assert.equal(mixed(matched), true);
  assert.equal(mixed(unmatched), false);
  assert.throws(() => createIsError(), /requires at least one error matcher/);
`;

describe('partial matcher factory in built packages', () => {
  it.each(['commonjs', 'module'])('preserves partial matching and rejection identity in %s', (mode) => {
    const imports =
      mode === 'commonjs' ?
        "const assert = require('node:assert/strict'); const promise = require('@cancjs/promise');"
      : "import assert from 'node:assert/strict'; import * as promise from '@cancjs/promise';";
    const code =
      imports +
      '\nconst { CancelablePromise: CP, createIsError, suppressErrors, catchErrors, createSuppressError, createCatchError } = promise;\n' +
      '(async () => {' +
      body +
      '})().catch((error) => { console.error(error); process.exitCode = 1; });';
    execFileSync(process.execPath, ['--input-type=' + mode, '-e', code], { cwd: repoRoot, encoding: 'utf8' });
  });
});
