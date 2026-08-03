import { register } from './index.ts';

// Deno needs .ts extension in imports
register();

// Create abandoned rejection — would crash without handler
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
