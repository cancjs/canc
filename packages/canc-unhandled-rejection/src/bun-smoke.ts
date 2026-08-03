import { CancelablePromise } from '@cancjs/promise';

import { register } from './index';

register();

const p = new CancelablePromise(() => {});
p.cancel();

setTimeout(() => {
  console.log('bun: CancelError suppressed, exit 0');
  process.exit(0);
}, 200);
