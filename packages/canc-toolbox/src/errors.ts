export type { ICatchErrorFn, ISuppressErrorFn } from '@cancjs/promise';
export {
  AbortError,
  catchAbort,
  catchTimeout,
  createCatchError,
  createSuppressError,
  isAbortError,
  isTimeoutError,
  suppressAbort,
  suppressTimeout,
  TimeoutError,
} from '@cancjs/promise';
// toolbox-only, no promise-package concept to relocate: straight off _util
export { isSupersededError, SupersededError } from '../../_util';
