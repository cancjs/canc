// Manual runtime check, run by deno directly: `deno run smoke/deno-smoke.ts`. Deno resolves
// local imports with their real extension, which is why this one keeps `.ts`.
import { register } from '../src/index.ts';

register();

// Abandoned rejection, would crash the process without the handler.
const p = Promise.reject(
  Object.assign(new Error(), {
    name: 'CancelError',
    [Symbol.for('@cancjs/promise:CancelError')]: true,
  }),
);
void p;

setTimeout(() => {
  console.log('deno: CancelError suppressed, exit 0');
  Deno.exit(0);
}, 200);
