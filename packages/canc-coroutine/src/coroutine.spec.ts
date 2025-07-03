import { cancAsync, cancAwait } from './coroutine';
import { suppressCancel } from '@cancjs/promise';

describe('cancAsync', () => {
 // Pre-existing scratch/placeholder smoke test (present since initial coroutine draft,
 // commit d4be87f) — calls .cancel() on a plain native Promise (bug in the test itself, not
 // coroutine.ts). coroutine.ts is out of scope until ( explicitly excludes it
 // from the coverage gate — see P2-10 / .claude/tasks/-tests.md). Skipped here so the
 // coverage-gate baseline is green; real coroutine test program lands in .
 it.skip('', () => {
 return (async () => {
 const p = cancAsync(function* () {
 const wtf = this.wtf;
 console.log('Hello');
 const p: Promise<number> = new Promise((resolve) => setTimeout(() => resolve(1), 1000));
 const n = yield* cancAwait(p);
 (p as any).cancel();
 yield* cancAwait(null);
 console.log(n);
 console.log('World');
 return /*yield* cancAwait*/(Promise.resolve(3));
 }, {wtf: 1})();


 console.log({ p })

 return p.catch(suppressCancel);
 })();
 })
});