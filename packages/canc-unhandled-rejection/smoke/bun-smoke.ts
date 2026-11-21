// Manual runtime check, run by bun directly: `bun smoke/bun-smoke.ts`.
import { CancelablePromise } from '@cancjs/promise';

import { register } from '../src/index';

register();

// listeners() keeps the brand on the handler it returns
const brand = Symbol.for('@cancjs/unhandled-rejection:handler');
const branded = process.listeners('unhandledRejection').filter((listener) => (listener as any)[brand]);
if (branded.length !== 1) {
  console.error(`bun: expected 1 branded listener, found ${branded.length}`);
  process.exit(1);
}

const p = new CancelablePromise(() => {});
p.cancel();

setTimeout(() => {
  console.log('bun: CancelError suppressed, exit 0');
  process.exit(0);
}, 200);
