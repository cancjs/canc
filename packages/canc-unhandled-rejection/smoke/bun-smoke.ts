// Manual runtime check, run by bun directly: `bun smoke/bun-smoke.ts`.
import { CancelablePromise } from '@cancjs/promise';

import { register } from '../src/index';

register();

const p = new CancelablePromise(() => {});
p.cancel();

setTimeout(() => {
  console.log('bun: CancelError suppressed, exit 0');
  process.exit(0);
}, 200);
