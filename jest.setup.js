/* global afterEach, afterAll, expect */

const unhandledErrors = [];

function onUnhandledRejection(reason) {
  const testName = (typeof expect !== 'undefined' && expect.getState().currentTestName) || 'unknown test';
  unhandledErrors.push({ error: reason, testName });
}

function onUncaughtException(error) {
  const testName = (typeof expect !== 'undefined' && expect.getState().currentTestName) || 'unknown test';
  unhandledErrors.push({ error, testName });
}

if (typeof process !== 'undefined' && process.on && !globalThis.__CANC_JEST_LISTENERS_SET) {
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);
  globalThis.__CANC_JEST_LISTENERS_SET = true;
}

function reportUnhandledErrors() {
  if (unhandledErrors.length > 0) {
    const errors = unhandledErrors.splice(0, unhandledErrors.length);
    const msgs = errors.map((e) => `[${e.testName}] ${e.error && e.error.stack ? e.error.stack : String(e.error)}`);
    throw new Error(`Unhandled errors:\n${msgs.join('\n\n')}`);
  }
}

afterEach(() => {
  reportUnhandledErrors();
});

const realSetImmediate = typeof setImmediate !== 'undefined' ? setImmediate : null;
const realSetTimeout = typeof setTimeout !== 'undefined' ? setTimeout : null;

afterAll(async () => {
  await new Promise((resolve) => {
    if (realSetImmediate) {
      realSetImmediate(resolve);
    } else if (realSetTimeout) {
      realSetTimeout(resolve, 0);
    } else {
      resolve();
    }
  });
  reportUnhandledErrors();
});
