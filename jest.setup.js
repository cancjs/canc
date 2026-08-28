/* global jest, afterEach, afterAll */

const unhandledErrors = [];

function onUnhandledRejection(reason) {
  unhandledErrors.push(reason);
  process.exitCode = 1;
}

function onUncaughtException(error) {
  unhandledErrors.push(error);
  process.exitCode = 1;
}

if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);
}

afterEach(() => {
  try {
    jest.useRealTimers();
  } catch {
    // Environment may not have jest timer methods
  }
  if (unhandledErrors.length > 0) {
    const error = unhandledErrors.shift();
    unhandledErrors.length = 0;
    throw error instanceof Error ? error : new Error(String(error));
  }
});

afterAll(async () => {
  try {
    jest.useRealTimers();
  } catch {
    // Environment may not have jest timer methods
  }
  await new Promise((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
  if (unhandledErrors.length > 0) {
    const error = unhandledErrors.shift();
    unhandledErrors.length = 0;
    throw error instanceof Error ? error : new Error(String(error));
  }
});
