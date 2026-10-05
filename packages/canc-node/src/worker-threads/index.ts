export type { ILock, ILockOptions, IRequestLockFn, TLockBody, TLockMode } from './locks';
export { requestLock } from './locks';
export type { IRunTaskOptions, TTerminateMode } from './run-task';
export { runTask, STOP_MESSAGE } from './run-task';
export type { IWorkerConstructor, IWorkerWithPromise } from './worker';
export { Worker } from './worker';

// structural re-exports, so a worker file does not import from two places for one job
export {
  BroadcastChannel,
  isMainThread,
  MessageChannel,
  MessagePort,
  parentPort,
  threadId,
  workerData,
} from 'node:worker_threads';
