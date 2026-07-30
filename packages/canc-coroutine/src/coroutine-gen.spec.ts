import { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenDelegate, awaited, AsyncGenResult } from './coroutine-gen';
import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';

// Helpers
async function drain<T>(iter: AsyncIterator<T> | AsyncIterable<T>): Promise<{ values: T[]; ret: any }> {
 const it: AsyncIterator<T> = (iter as any)[Symbol.asyncIterator]
 ? (iter as any)[Symbol.asyncIterator]()
 : (iter as AsyncIterator<T>);
 const values: T[] = [];
 // eslint-disable-next-line no-constant-condition
 while (true) {
 const res = await it.next();
 if (res.done) {
 return { values, ret: res.value };
 }
 values.push(res.value);
 }
}

const microtask = () => Promise.resolve();

// Deterministic multi-hop microtask flush (mirrors coroutine-each.spec): drains the microtask
// queue N times so chained then-callbacks (internal-await round trips) all run.
const flush = async (times = 12) => {
 for (let i = 0; i < times; i++) {
 await Promise.resolve();
 }
};

type ParityRow = { scenario: string; native: string; canc: string; match: boolean };
const parityRows: ParityRow[] = [];

function recordParity(scenario: string, native: any, canc: any) {
 const n = JSON.stringify(native);
 const c = JSON.stringify(canc);
 parityRows.push({ scenario, native: n, canc: c, match: n === c });
 return { native: n, canc: c };
}

// Native-parity tests: build both a native async generator and a canc coroutine-gen,
// run identical driver scripts, assert identical output.
describe('cancGenAsync — native async-generator parity', () => {
 it('empty generator: no emissions, done immediately', async () => {
 async function* nativeGen(): AsyncGenerator<never, void> {}
 const cancGen = cancGenAsync(function* (): Generator<never, void> {});

 const nat = await drain(nativeGen());
 const canc = await drain(cancGen());

 const { native, canc: c } = recordParity('empty', nat, canc);
 expect(c).toBe(native);
 expect(canc.values).toEqual([]);
 });

 it('emits plain yields in order', async () => {
 async function* nativeGen(): AsyncGenerator<number, void> {
 yield 1;
 yield 2;
 yield 3;
 }
 const cancGen = cancGenAsync(function* (): Generator<number, void> {
 yield 1;
 yield 2;
 yield 3;
 });

 const nat = await drain(nativeGen());
 const canc = await drain(cancGen());

 const { native, canc: c } = recordParity('plain yields', nat, canc);
 expect(c).toBe(native);
 expect(canc.values).toEqual([1, 2, 3]);
 });

 it('internal await does not emit; only yields emit', async () => {
 async function* nativeGen(): AsyncGenerator<number, void> {
 const a: number = await Promise.resolve(10);
 yield a;
 const b: number = await Promise.resolve(20);
 yield a + b;
 }
 const cancGen = cancGenAsync(function* (): AsyncGenResult<number> {
 const a = yield* cancGenAwait(Promise.resolve(10));
 yield a;
 const b = yield* cancGenAwait(Promise.resolve(20));
 yield a + b;
 });

 const nat = await drain(nativeGen());
 const canc = await drain(cancGen());

 const { native, canc: c } = recordParity('await + yield mix', nat, canc);
 expect(c).toBe(native);
 expect(canc.values).toEqual([10, 30]);
 });

 it('generator return value surfaces as final done result', async () => {
 async function* nativeGen(): AsyncGenerator<number, number> {
 yield 1;
 return 99;
 }
 const cancGen = cancGenAsync(function* (): Generator<number, number> {
 yield 1;
 return 99;
 });

 const nat = await drain(nativeGen());
 const canc = await drain(cancGen());

 const { native, canc: c } = recordParity('return value', nat, canc);
 expect(c).toBe(native);
 expect(canc.ret).toBe(99);
 expect(canc.values).toEqual([1]);
 });

 it('awaited return value is resolved before final done', async () => {
 async function* nativeGen(): AsyncGenerator<number, number> {
 yield 1;
 return await Promise.resolve(42);
 }
 const cancGen = cancGenAsync(function* (): AsyncGenResult<number, number> {
 yield 1;
 return yield* cancGenAwait(Promise.resolve(42));
 });

 const nat = await drain(nativeGen());
 const canc = await drain(cancGen());

 const { native, canc: c } = recordParity('awaited return', nat, canc);
 expect(c).toBe(native);
 expect(canc.ret).toBe(42);
 });

 it('yielded value received back via next() argument', async () => {
 async function* nativeGen(): AsyncGenerator<number, void, number> {
 const x = yield 1;
 yield (x as number) * 2;
 }
 function makeCanc() {
 return cancGenAsync(function* (): Generator<number, void, any> {
 const x = yield 1;
 yield x * 2;
 })();
 }

 const nit = nativeGen();
 const n0 = await nit.next();
 const n1 = await nit.next(5);
 const n2 = await nit.next();

 const cit = makeCanc();
 const c0 = await cit.next();
 const c1 = await cit.next(5);
 const c2 = await cit.next();

 const nat = [n0, n1, n2];
 const canc = [c0, c1, c2];
 const { native, canc: c } = recordParity('next(arg) feedback', nat, canc);
 expect(c).toBe(native);
 expect(c1.value).toBe(10);
 });

 it('throw() propagates into generator try/catch', async () => {
 async function* nativeGen(): AsyncGenerator<string, void> {
 try {
 yield 1 as any;
 } catch (e) {
 yield `caught:${e}`;
 }
 }
 function makeCanc() {
 return cancGenAsync(function* (): Generator<string, void, any> {
 try {
 yield 1 as any;
 } catch (e) {
 yield `caught:${e}`;
 }
 })();
 }

 const nit = nativeGen();
 await nit.next();
 const nThrown = await nit.throw('boom');

 const cit = makeCanc();
 await cit.next();
 const cThrown = await cit.throw('boom');

 const { native, canc: c } = recordParity('throw into try/catch', nThrown, cThrown);
 expect(c).toBe(native);
 expect(cThrown.value).toBe('caught:boom');
 });

 it('return() early-terminates and runs finally', async () => {
 const nativeLog: string[] = [];
 const cancLog: string[] = [];
 async function* nativeGen(): AsyncGenerator<number, any> {
 try {
 yield 1;
 yield 2;
 } finally {
 nativeLog.push('finally');
 }
 }
 const cancGen = cancGenAsync(function* (): Generator<number, any, any> {
 try {
 yield 1;
 yield 2;
 } finally {
 cancLog.push('finally');
 }
 });

 const nit = nativeGen();
 await nit.next();
 const nRet = await nit.return(77 as any);

 const cit = cancGen();
 await cit.next();
 const cRet = await cit.return(77 as any);

 const natRes = { ret: nRet, log: nativeLog };
 const cancRes = { ret: cRet, log: cancLog };
 const { native, canc: c } = recordParity('return() + finally', natRes, cancRes);
 expect(c).toBe(native);
 expect(cancLog).toEqual(['finally']);
 });

 it('rejected internal await surfaces as throw inside generator', async () => {
 async function* nativeGen(): AsyncGenerator<string, void> {
 try {
 await Promise.reject('nope');
 yield 'unreached';
 } catch (e) {
 yield `err:${e}`;
 }
 }
 const cancGen = cancGenAsync(function* (): AsyncGenResult<string> {
 try {
 yield* cancGenAwait<string>(CancelablePromise.reject('nope'));
 yield 'unreached';
 } catch (e) {
 yield `err:${e}`;
 }
 });

 const nat = await drain(nativeGen());
 const canc = await drain(cancGen());

 const { native, canc: c } = recordParity('rejected await -> catch', nat, canc);
 expect(c).toBe(native);
 expect(canc.values).toEqual(['err:nope']);
 });

 it('sync throw inside generator rejects the pending step', async () => {
 async function* nativeGen(): AsyncGenerator<number, void> {
 yield 1;
 throw new Error('sync-boom');
 }
 const cancGen = cancGenAsync(function* (): Generator<number, void> {
 yield 1;
 throw new Error('sync-boom');
 });

 const nit = nativeGen();
 await nit.next();
 let nErr: any;
 try {
 await nit.next();
 } catch (e) {
 nErr = (e as Error).message;
 }

 const cit = cancGen();
 await cit.next();
 let cErr: any;
 try {
 await cit.next();
 } catch (e) {
 cErr = (e as Error).message;
 }

 const { native, canc: c } = recordParity('sync throw', nErr, cErr);
 expect(c).toBe(native);
 expect(cErr).toBe('sync-boom');
 });

 it('for-await consumes emitted values in order', async () => {
 async function* nativeGen(): AsyncGenerator<string, void> {
 yield 'a';
 await Promise.resolve();
 yield 'b';
 yield 'c';
 }
 const cancGen = cancGenAsync(function* (): AsyncGenResult<string> {
 yield 'a';
 yield* cancGenAwait(Promise.resolve());
 yield 'b';
 yield 'c';
 });

 const nat: string[] = [];
 for await (const v of nativeGen()) nat.push(v);
 const canc: string[] = [];
 for await (const v of cancGen()) canc.push(v as string);

 const { native, canc: c } = recordParity('for-await full', nat, canc);
 expect(c).toBe(native);
 expect(canc).toEqual(['a', 'b', 'c']);
 });
});

// Protocol correctness
describe('cancGenAsync — protocol', () => {
 it('exposes Symbol.asyncIterator returning self', () => {
 const it = cancGenAsync(function* () {})();
 expect(typeof (it as any)[Symbol.asyncIterator]).toBe('function');
 expect((it as any)[Symbol.asyncIterator]()).toBe(it);
 });

 it('next() returns a CancelablePromise', () => {
 const it = cancGenAsync(function* () {
 yield 1;
 })();
 const p = it.next();
 expect(p).toBeInstanceOf(CancelablePromise);
 return (p as CancelablePromise<any>).catch(suppressCancel);
 });

 it('has next / throw / return methods', () => {
 const it = cancGenAsync(function* () {})();
 expect(typeof it.next).toBe('function');
 expect(typeof it.throw).toBe('function');
 expect(typeof it.return).toBe('function');
 });

 it('post-completion next() reports done', async () => {
 const it = cancGenAsync(function* (): Generator<number, void> {
 yield 1;
 })();
 await it.next();
 const end = await it.next();
 expect(end.done).toBe(true);
 const after = await it.next();
 expect(after.done).toBe(true);
 expect(after.value).toBeUndefined();
 });

 it('throws TypeError for non-function argument', () => {
 expect(() => cancGenAsync(123 as any)).toThrow(TypeError);
 });

 it('threads `this` through to the generator function', async () => {
 const ctx = { base: 100 };
 const gen = cancGenAsync(function* (this: typeof ctx): Generator<number, void> {
 yield this.base + 1;
 });
 const it = gen.call(ctx);
 const first = await it.next();
 expect(first.value).toBe(101);
 });

 it('passes constructor args to the generator function', async () => {
 const gen = cancGenAsync(function* (a: number, b: number): Generator<number, void> {
 yield a + b;
 });
 const it = gen(3, 4);
 expect((await it.next()).value).toBe(7);
 });
});

// Queued-call ordering
describe('cancGenAsync — queued call ordering', () => {
 it('serves concurrently-issued next() calls FIFO', async () => {
 const it = cancGenAsync(function* (): AsyncGenResult<string> {
 yield* cancGenAwait(Promise.resolve());
 yield 'a';
 yield* cancGenAwait(Promise.resolve());
 yield 'b';
 yield 'c';
 })();

 const p1 = it.next();
 const p2 = it.next();
 const p3 = it.next();

 const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
 expect([r1.value, r2.value, r3.value]).toEqual(['a', 'b', 'c']);
 });

 it('queued next() and return() interleave in issue order', async () => {
 const log: string[] = [];
 const it = cancGenAsync(function* (): AsyncGenResult<string, any> {
 try {
 yield* cancGenAwait(Promise.resolve());
 yield 'a';
 yield 'b';
 } finally {
 log.push('finally');
 }
 })();

 const p1 = it.next();
 const pRet = it.return(0 as any);
 const p3 = it.next();

 const r1 = await p1;
 const rRet = await pRet.catch(suppressCancel as any);
 const r3 = await p3;

 expect(r1.value).toBe('a');
 expect((rRet as any).done).toBe(true);
 expect(r3.done).toBe(true);
 expect(log).toEqual(['finally']);
 });

 it('all queued values arrive without loss under rapid firing', async () => {
 const it = cancGenAsync(function* (): AsyncGenResult<number> {
 for (let i = 0; i < 5; i++) {
 yield* cancGenAwait(microtask());
 yield i;
 }
 })();

 const promises = [it.next(), it.next(), it.next(), it.next(), it.next()];
 const results = await Promise.all(promises);
 expect(results.map((r) => r.value)).toEqual([0, 1, 2, 3, 4]);
 });
});

// Cancellation
describe('cancGenAsync — cancellation', () => {
 it('cancel current step rejects it with CancelError', async () => {
 const it = cancGenAsync(function* (): AsyncGenResult<unknown> {
 yield* cancGenAwait(new Promise(() => {}));
 yield 'unreached';
 })();

 const p = it.next() as CancelablePromise<any>;
 p.cancel();

 let err: any;
 await p.catch((e) => {
 err = e;
 });
 expect(isCancelError(err)).toBe(true);
 });

 it('cancel runs generator finally (cleanup)', async () => {
 const log: string[] = [];
 const it = cancGenAsync(function* (): AsyncGenResult<unknown> {
 try {
 yield* cancGenAwait(new Promise(() => {}));
 } finally {
 log.push('cleanup');
 }
 })();

 const p = it.next() as CancelablePromise<any>;
 p.cancel();
 await p.catch(suppressCancel);
 await microtask();
 expect(log).toEqual(['cleanup']);
 });

 it('cancel drains queued steps with CancelError', async () => {
 const it = cancGenAsync(function* (): AsyncGenResult<string> {
 yield* cancGenAwait(new Promise(() => {}));
 yield 'a';
 yield 'b';
 })();

 const p1 = it.next() as CancelablePromise<any>;
 const p2 = it.next() as CancelablePromise<any>;
 const p3 = it.next() as CancelablePromise<any>;

 p1.cancel();

 const errs: any[] = [];
 await p1.catch((e) => errs.push(e));
 await p2.catch((e) => errs.push(e));
 await p3.catch((e) => errs.push(e));

 expect(errs.length).toBe(3);
 expect(errs.every(isCancelError)).toBe(true);
 });

 it('cancel mid-iteration stops further emissions', async () => {
 let reached = false;
 const it = cancGenAsync(function* (): AsyncGenResult<string> {
 yield 'first';
 yield* cancGenAwait(new Promise(() => {}));
 reached = true;
 yield 'second';
 })();

 const first = await it.next();
 expect(first.value).toBe('first');

 const p = it.next() as CancelablePromise<any>;
 p.cancel();
 await p.catch(suppressCancel);
 await microtask();

 expect(reached).toBe(false);
 });

 it('post-cancel next() reports done', async () => {
 const it = cancGenAsync(function* (): AsyncGenResult<string> {
 yield* cancGenAwait(new Promise(() => {}));
 yield 'x';
 })();

 const p = it.next() as CancelablePromise<any>;
 p.cancel();
 await p.catch(suppressCancel);

 const after = await it.next();
 expect(after.done).toBe(true);
 });

 it('cancel with a custom string reason wraps into CancelError message', async () => {
 const it = cancGenAsync(function* (): AsyncGenResult<unknown> {
 yield* cancGenAwait(new Promise(() => {}));
 })();

 const p1 = it.next() as CancelablePromise<any>;
 const p2 = it.next() as CancelablePromise<any>;
 p1.cancel('stop-now');

 let err: any;
 await p2.catch((e) => {
 err = e;
 });
 expect(isCancelError(err)).toBe(true);
 expect((err as CancelError).message).toBe('stop-now');
 });
});

// for-await + break (iterator.return path)
describe('cancGenAsync — for-await break', () => {
 it('break in for-await calls return() and runs finally', async () => {
 const log: string[] = [];
 const gen = cancGenAsync(function* (): Generator<number, void, any> {
 try {
 yield 1;
 yield 2;
 yield 3;
 } finally {
 log.push('finally');
 }
 });

 const seen: number[] = [];
 for await (const v of gen()) {
 seen.push(v as number);
 if (v === 2) break;
 }

 expect(seen).toEqual([1, 2]);
 expect(log).toEqual(['finally']);
 });

 it('break parity with native async generator', async () => {
 async function* nativeGen(): AsyncGenerator<number, void> {
 let i = 0;
 try {
 while (true) {
 yield i++;
 }
 } finally {
 /* native cleanup */
 }
 }
 const cancGen = cancGenAsync(function* (): Generator<number, void, any> {
 let i = 0;
 while (true) {
 yield i++;
 }
 });

 const nat: number[] = [];
 for await (const v of nativeGen()) {
 nat.push(v);
 if (v >= 2) break;
 }
 const canc: number[] = [];
 for await (const v of cancGen()) {
 canc.push(v as number);
 if ((v as number) >= 2) break;
 }

 const { native, canc: c } = recordParity('for-await break', nat, canc);
 expect(c).toBe(native);
 expect(canc).toEqual([0, 1, 2]);
 });
});

// transformYield hook
describe('cancGenAsync — transformYield', () => {
 it('transforms each yielded value before emission', async () => {
 const it = cancGenAsync(
 function* (): Generator<number, void> {
 yield 1;
 yield 2;
 },
 { transformYield: (v: any) => (typeof v === 'number' ? v * 10 : v) },
 )();

 const { values } = await drain(it);
 expect(values).toEqual([10, 20]);
 });

 it('transformYield can promote a value to awaited (internal await)', async () => {
 const it = cancGenAsync(
 function* (): Generator<string, void> {
 yield 5 as any;
 yield 'done';
 },
 { transformYield: (v: any) => (typeof v === 'number' ? awaited(v) : v) },
 )();

 const { values } = await drain(it);
 expect(values).toEqual(['done']);
 });

 it('transformYield is applied to internal-await values too', async () => {
 const seen: any[] = [];
 const it = cancGenAsync(
 function* (): AsyncGenResult<number> {
 const r = yield* cancGenAwait(Promise.resolve(3));
 yield r;
 },
 {
 transformYield: (v: any) => {
 seen.push(v);
 return v;
 },
 },
 )();

 const { values } = await drain(it);
 expect(values).toEqual([3]);
 expect(seen.length).toBeGreaterThanOrEqual(2);
 });
});

// cancGenDelegate / cancGenForAwait: producer-side consume + re-emit helpers
describe('cancGenDelegate — re-emit a sub async-iterable', () => {
 it('re-emits the sub-iterable items to the consumer for-await, in order', async () => {
 async function* sub(): AsyncGenerator<number, void> {
 yield 1;
 yield 2;
 yield 3;
 }

 const cancGen = cancGenAsync(function* (): AsyncGenResult<number> {
 yield* cancGenDelegate(sub());
 });

 const { values } = await drain(cancGen());
 expect(values).toEqual([1, 2, 3]);
 });

 it('re-emits a sync iterable of promises, resolving each before emit', async () => {
 const cancGen = cancGenAsync(function* (): AsyncGenResult<string> {
 yield* cancGenDelegate([Promise.resolve('a'), Promise.resolve('b'), 'c']);
 });

 const { values } = await drain(cancGen());
 expect(values).toEqual(['a', 'b', 'c']);
 });
});

describe('cancGenForAwait — consume inside a producer', () => {
 it('runs cb per item and does not emit any of them to the consumer', async () => {
 const seen: Array<[number, number]> = [];

 const cancGen = cancGenAsync(function* (): AsyncGenResult<string> {
 yield* cancGenForAwait([10, 20, 30] as const, (value: number, index: number) => {
 seen.push([index, value]);
 });
 yield 'done';
 });

 const { values } = await drain(cancGen());
 expect(values).toEqual(['done']);
 expect(seen).toEqual([
 [0, 10],
 [1, 20],
 [2, 30],
 ]);
 });

 it('.toArray collects the sub-iterable, then the producer emits the collected result', async () => {
 async function* sub(): AsyncGenerator<number, void> {
 yield 1;
 yield 2;
 yield 3;
 }

 const cancGen = cancGenAsync(function* (): AsyncGenResult<number[]> {
 const items = yield* cancGenForAwait.toArray(sub());
 yield items;
 });

 const { values } = await drain(cancGen());
 expect(values).toEqual([[1, 2, 3]]);
 });
});

// A controllable async source: each pull blocks on an externally-resolved promise, so a test can
// hold the outer cancGenAsync mid-consumption and cancel it deterministically while a sub pull is
// genuinely in flight (mirrors coroutine-each-cancel.spec.ts's makeControllableSource).
function makeControllableSource<T>() {
 const gate: Array<{ promise: Promise<T>; resolve: (v: T) => void }> = [];
 const state = { finallyRan: false };

 const source = {
 [Symbol.asyncIterator]() {
 return this;
 },
 next(): Promise<IteratorResult<T>> {
 let resolve!: (v: T) => void;
 const promise = new Promise<T>((r) => {
 resolve = r;
 });
 gate.push({ promise, resolve });

 return promise.then((value) => ({ value, done: false }));
 },
 return(): Promise<IteratorResult<T>> {
 state.finallyRan = true;

 return Promise.resolve({ value: undefined as any, done: true });
 },
 };

 const deliver = (index: number, value: T) => gate[index].resolve(value);

 return { source, deliver, state };
}

describe('cancGenAsync — cancel mid-cancGenForAwait/cancGenDelegate runs sub return() cleanup', () => {
 it('cancel mid-cancGenForAwait (sub pull in flight) runs the sub source finally', async () => {
 const { source, deliver, state } = makeControllableSource<number>();
 const seen: number[] = [];

 const cancGen = cancGenAsync(function* (): AsyncGenResult<never> {
 yield* cancGenForAwait(source, (value: number) => {
 seen.push(value);
 });
 });

 const it = cancGen();
 const p = it.next() as CancelablePromise<any>;
 p.catch(suppressCancel);

 deliver(0, 1);
 await flush();
 expect(seen).toEqual([1]);
 expect(state.finallyRan).toBe(false);

 p.cancel();
 await p.catch(suppressCancel);
 await flush();

 expect(state.finallyRan).toBe(true);
 });

 it('cancel mid-cancGenDelegate (sub pull in flight) runs the sub source finally', async () => {
 const { source, deliver, state } = makeControllableSource<number>();

 const cancGen = cancGenAsync(function* (): AsyncGenResult<number> {
 yield* cancGenDelegate(source);
 });

 const it = cancGen();
 const first = it.next() as CancelablePromise<any>;
 first.catch(suppressCancel);

 deliver(0, 1);
 const firstResult = await first;
 expect(firstResult.value).toBe(1);
 expect(state.finallyRan).toBe(false);

 const p = it.next() as CancelablePromise<any>;
 p.cancel();
 await p.catch(suppressCancel);
 await flush();

 expect(state.finallyRan).toBe(true);
 });
});

// Cancel aborts the in-flight awaited source (the underlying op is canceled, not just abandoned).
describe('cancGenAsync — cancel aborts in-flight source', () => {
 it('cancel fires the awaited source cancel handler (abort)', async () => {
 let aborted = 0;
 // A never-settling source that records its own cancellation.
 const source = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
 handleCancel(() => {
 aborted++;
 });
 });

 const it = cancGenAsync(function* (): AsyncGenResult<unknown> {
 yield* cancGenAwait(source);
 yield 'unreached';
 })();

 const p = it.next() as CancelablePromise<any>;
 await flush();
 p.cancel();
 await p.catch(suppressCancel);
 await flush();

 expect(aborted).toBe(1);
 });

 it('a source settling after cancel does not crash the driver', async () => {
 let resolveSource!: (v: number) => void;
 const source = new CancelablePromise<number>((resolve) => {
 resolveSource = resolve;
 });

 const it = cancGenAsync(function* (): AsyncGenResult<number> {
 const n = yield* cancGenAwait(source);
 yield n;
 })();

 const p = it.next() as CancelablePromise<any>;
 p.catch(suppressCancel);

 await flush();
 // Cancel while the producer is suspended on the await, then settle the source LATER.
 setTimeout(() => p.cancel(), 0);
 await new Promise((r) => setTimeout(r, 5));

 let threw: any;
 try {
 resolveSource(42);
 await flush();
 } catch (e) {
 threw = e;
 }

 expect(threw).toBeUndefined();
 });
});

describe('cancGenAwait — combinator parity (all/race/any/allSettled/try)', () => {
 it('all(): resolves the tuple as an internal await, not emitted to the consumer', async () => {
 const producer = cancGenAsync(function* (): AsyncGenResult<string, void> {
 const [n, s] = yield* cancGenAwait.all([Promise.resolve(1), Promise.resolve('a')]);
 yield `combined:${n}:${s}`;
 });

 const { values } = await drain(producer());

 // Only the bare `yield` surfaces to the consumer — the combinator's own tuple never does.
 expect(values).toEqual(['combined:1:a']);
 });

 it('race(): winner value threads through yield*, loser gets canceled', async () => {
 let loserCanceled = false;
 const loser = new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
 handleCancel(() => {
 loserCanceled = true;
 });
 });
 const winner = new CancelablePromise<string>((resolve) => {
 Promise.resolve().then(() => resolve('fast'));
 });

 const producer = cancGenAsync(function* (): AsyncGenResult<string, void> {
 const value = yield* cancGenAwait.race([winner, loser]);
 yield value;
 });

 const { values } = await drain(producer());
 await flush(3);

 expect(values).toEqual(['fast']);
 expect(loserCanceled).toBe(true);
 });

 it('any(): first fulfillment wins, other pending input canceled', async () => {
 let loserCanceled = false;
 const loser = new CancelablePromise<string>((_resolve, _reject, { handleCancel }) => {
 handleCancel(() => {
 loserCanceled = true;
 });
 });
 const winner = new CancelablePromise<string>((resolve) => {
 Promise.resolve().then(() => resolve('winner'));
 });

 const producer = cancGenAsync(function* (): AsyncGenResult<string, void> {
 const value = yield* cancGenAwait.any([winner, loser]);
 yield value;
 });

 const { values } = await drain(producer());
 await flush(3);

 expect(values).toEqual(['winner']);
 expect(loserCanceled).toBe(true);
 });

 it('allSettled(): never cancels a pending input, resolves full settled tuple', async () => {
 let canceled = false;
 const slow = new CancelablePromise<number>((resolve, _reject, { handleCancel }) => {
 handleCancel(() => {
 canceled = true;
 });
 Promise.resolve().then(() => Promise.resolve()).then(() => resolve(2));
 });

 const producer = cancGenAsync(function* (): AsyncGenResult<PromiseSettledResult<number>[], void> {
 const settled = yield* cancGenAwait.allSettled([Promise.resolve(1), slow]);
 yield settled;
 });

 const { values } = await drain(producer());

 expect(values).toEqual([[
 { status: 'fulfilled', value: 1 },
 { status: 'fulfilled', value: 2 },
 ]]);
 expect(canceled).toBe(false);
 });

 it('try(): wraps a sync-returning fn and threads its value through yield*', async () => {
 const producer = cancGenAsync(function* (): AsyncGenResult<number, void> {
 const value = yield* cancGenAwait.try(() => 2);
 yield value;
 });

 const { values } = await drain(producer());

 expect(values).toEqual([2]);
 });

 it('try(): a synchronously-throwing fn rejects the driven step (not silently swallowed)', async () => {
 const boom = new Error('try-boom');
 const producer = cancGenAsync(function* (): AsyncGenResult<number, void> {
 yield* cancGenAwait.try((): number => {
 throw boom;
 });
 yield 999; // unreached
 });

 const it = producer();
 await expect(it.next()).rejects.toBe(boom);
 });

 it('emit-vs-await contract: a bare `yield` from a combinator WOULD leak into the consumer (anti-stub guard)', async () => {
 // Sanity check on the test itself: prove drain() actually surfaces whatever a combinator yields
 // bare, unresolved, so the "not emitted" assertions above are meaningful (they would fail if a
 // real combinator did a bare `yield build(...)` instead of `yield awaited(build(...))` — the
 // driver only resolves+hides `awaited(...)` values; anything else, including a raw combined
 // CancelablePromise, is emitted to the consumer as-is).
 const leaky = cancGenAsync(function* (): AsyncGenResult<any, void> {
 // Simulates what a combinator would produce if it forgot to wrap in `awaited(...)`.
 yield CancelablePromise.all([Promise.resolve(1), Promise.resolve('a')]);
 });

 const { values } = await drain(leaky());

 // The bare yield DID leak the (unresolved) combined promise straight to the consumer, proving
 // drain() would have caught a real combinator regression the same way.
 expect(values).toHaveLength(1);
 expect(values[0]).toBeInstanceOf(CancelablePromise);
 });
});

// Native-parity table (printed in spec output)
describe('cancGenAsync — native-parity table', () => {
 it('every recorded scenario matches native async-generator output', () => {
 const header = 'scenario | native === canc';
 const sep = '--------------------------------|-----------------';
 const lines = parityRows.map(
 (r) => `${r.scenario.padEnd(31)} | ${r.match ? 'YES' : 'NO '} ${r.match ? '' : `(n=${r.native} c=${r.canc})`}`,
 );

 // eslint-disable-next-line no-console
 console.log(['', 'NATIVE ASYNC-GENERATOR PARITY TABLE', header, sep, ...lines, ''].join('\n'));

 expect(parityRows.length).toBeGreaterThanOrEqual(10);
 expect(parityRows.every((r) => r.match)).toBe(true);
 });
});
