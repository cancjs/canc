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
