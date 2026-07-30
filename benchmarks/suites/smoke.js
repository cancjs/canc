'use strict';

/**
 * Trivial one-suite smoke test. Not a real
 * micro-benchmark (see micro.js for the actual construct/resolve/chain suites) —
 * just proves the runner + JSON + md pipeline works end to end.
 */
module.exports = {
  name: 'smoke',
  cases: [
    {
      name: 'native-promise-resolve',
      fn() {
        return Promise.resolve(1);
      },
    },
    {
      name: 'noop',
      fn() {},
    },
  ],
};
