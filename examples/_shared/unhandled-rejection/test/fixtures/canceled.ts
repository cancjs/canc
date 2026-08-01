import '../../src/index';

import { CancelablePromise } from '@cancjs/promise';

// Abandoned canceled promise: no .catch anywhere. Without the guard this fires
// unhandledRejection and, under --unhandled-rejections=throw, crashes the process.
const load = new CancelablePromise<void>(() => {});
load.cancel();
