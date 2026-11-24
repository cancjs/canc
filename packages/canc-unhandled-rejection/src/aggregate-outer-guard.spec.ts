import { promiseSrc, runChild, unhandledSrc } from '../test/child-process.helper';

jest.setTimeout(30000);

const cases: Array<[string, string, boolean, number, string]> = [
  ['ordinary Error', "Object.assign(new Error('OUTER_REAL'), { errors: [cancel] })", false, 0, '{}'],
  ['plain object', "({ message: 'OUTER_REAL', errors: [cancel] })", false, 0, '{}'],
  [
    'abort opt-in',
    "Object.assign(new Error('OUTER_REAL'), { errors: [{ name: 'AbortError' }] })",
    false,
    0,
    '{ abort: true }',
  ],
  [
    'timeout opt-in',
    "Object.assign(new Error('OUTER_REAL'), { errors: [{ name: 'TimeoutError' }] })",
    false,
    0,
    '{ timeout: true }',
  ],
  [
    'ordinary getter',
    "Object.defineProperty(new Error('OUTER_REAL'), 'errors', { get() { hits++; return [cancel]; } })",
    false,
    0,
    '{}',
  ],
  [
    'plain throwing getter',
    "Object.defineProperty({ message: 'OUTER_REAL' }, 'errors', { get() { hits++; throw new Error('getter'); } })",
    false,
    0,
    '{}',
  ],
  ['native aggregate', "new AggregateError([cancel], 'OUTER_REAL')", true, 0, '{}'],
  [
    'foreign aggregate',
    "require('node:vm').runInNewContext('new AggregateError([cancel], \"OUTER_REAL\")', { cancel })",
    true,
    0,
    '{}',
  ],
  ['mixed aggregate', "new AggregateError([cancel, new Error('real')], 'OUTER_REAL')", false, 0, '{}'],
  ['empty aggregate', "new AggregateError([], 'OUTER_REAL')", false, 0, '{}'],
  [
    'aggregate getter throws',
    "Object.defineProperty(new AggregateError([], 'OUTER_REAL'), 'errors', { get() { hits++; throw new Error('getter'); } })",
    false,
    1,
    '{}',
  ],
  [
    'name-spoof interop',
    "Object.assign(new Error('OUTER_REAL'), { name: 'AggregateError', errors: [cancel] })",
    true,
    0,
    '{}',
  ],
];

describe('aggregate outer identity', () => {
  it.each(cases)(
    '%s: preserves callback identity and exact getter access',
    (_label, expression, suppressed, getterHits, options) => {
      const res = runChild(
        'const { CancelError } = require(' +
          JSON.stringify(promiseSrc) +
          ');' +
          'const { registerNode } = require(' +
          JSON.stringify(unhandledSrc) +
          ');' +
          "const cancel = new CancelError('cancel'); let hits = 0, count = 0, same = true;" +
          'const reason = ' +
          expression +
          ';' +
          'registerNode({ ...' +
          options +
          ', warn: false, onUnhandledRejection(r,p) { count++; same = same && r === reason && p === rejected; } });' +
          'const rejected = Promise.reject(reason);' +
          "process.on('exit', () => console.log(JSON.stringify({count, same, hits})));",
        { NODE_OPTIONS: '' },
      );
      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout.trim())).toEqual({ count: suppressed ? 0 : 1, same: true, hits: getterHits });
    },
  );

  it.each(cases)(
    '%s: retains the actual throw-mode host outcome',
    (_label, expression, suppressed, getterHits, options) => {
      const res = runChild(
        'const { CancelError } = require(' +
          JSON.stringify(promiseSrc) +
          ');' +
          'const { registerNode } = require(' +
          JSON.stringify(unhandledSrc) +
          ');' +
          "const cancel = new CancelError('cancel'); let hits = 0, count = 0, same = true;" +
          'const reason = ' +
          expression +
          ';' +
          'registerNode({ ...' +
          options +
          ', warn: false });' +
          "process.on('uncaughtExceptionMonitor', r => { count++; same = same && r === reason; });" +
          "process.on('exit', () => console.log(JSON.stringify({count, same, hits})));" +
          'Promise.reject(reason);',
        { NODE_OPTIONS: '' },
      );
      expect(res.status).toBe(suppressed ? 0 : 1);
      expect(JSON.parse(res.stdout.trim())).toEqual({ count: suppressed ? 0 : 1, same: true, hits: getterHits });
      if (!suppressed) expect(res.stderr).toContain('OUTER_REAL');
    },
  );
});
