import '../../src/index';
import { CancelablePromise } from '@cancjs/promise';

// Abandoned promise with a genuine error: the guard must let this one surface.
new CancelablePromise<void>((_resolve, reject) => {
 reject(new Error('real failure'));
});
