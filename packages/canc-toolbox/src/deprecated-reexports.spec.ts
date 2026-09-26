import {
  AbortError as PromiseAbortError,
  catchAbort as promiseCatchAbort,
  catchTimeout as promiseCatchTimeout,
  createCatchError as promiseCreateCatchError,
  createSuppressError as promiseCreateSuppressError,
  isAbortError as promiseIsAbortError,
  isTimeoutError as promiseIsTimeoutError,
  suppressAbort as promiseSuppressAbort,
  suppressTimeout as promiseSuppressTimeout,
  TimeoutError as PromiseTimeoutError,
} from '@cancjs/promise';

import {
  AbortError as ToolboxAbortError,
  catchAbort as toolboxCatchAbort,
  catchTimeout as toolboxCatchTimeout,
  createCatchError as toolboxCreateCatchError,
  createSuppressError as toolboxCreateSuppressError,
  isAbortError as toolboxIsAbortError,
  isTimeoutError as toolboxIsTimeoutError,
  suppressAbort as toolboxSuppressAbort,
  suppressTimeout as toolboxSuppressTimeout,
  TimeoutError as ToolboxTimeoutError,
} from './index';

describe('Deprecated error family re-exports', () => {
  it('resolves AbortError to the exact same object', () => {
    expect(ToolboxAbortError).toBe(PromiseAbortError);
  });
  it('resolves catchAbort to the exact same object', () => {
    expect(toolboxCatchAbort).toBe(promiseCatchAbort);
  });
  it('resolves catchTimeout to the exact same object', () => {
    expect(toolboxCatchTimeout).toBe(promiseCatchTimeout);
  });
  it('resolves createCatchError to the exact same object', () => {
    expect(toolboxCreateCatchError).toBe(promiseCreateCatchError);
  });
  it('resolves createSuppressError to the exact same object', () => {
    expect(toolboxCreateSuppressError).toBe(promiseCreateSuppressError);
  });
  it('resolves isAbortError to the exact same object', () => {
    expect(toolboxIsAbortError).toBe(promiseIsAbortError);
  });
  it('resolves isTimeoutError to the exact same object', () => {
    expect(toolboxIsTimeoutError).toBe(promiseIsTimeoutError);
  });
  it('resolves suppressAbort to the exact same object', () => {
    expect(toolboxSuppressAbort).toBe(promiseSuppressAbort);
  });
  it('resolves suppressTimeout to the exact same object', () => {
    expect(toolboxSuppressTimeout).toBe(promiseSuppressTimeout);
  });
  it('resolves TimeoutError to the exact same object', () => {
    expect(ToolboxTimeoutError).toBe(PromiseTimeoutError);
  });
});
