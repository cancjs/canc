import { Readable, Writable } from 'node:stream';

import { CancelablePromise, isCancelError } from '@cancjs/promise';

import * as readlineExports from './index';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Never invoked: tsc resolving this body is the assertion, so a wrapper accidentally widened to
// `unknown` fails compilation here rather than at a consumer's call site.
function typeAssertions(rl: readlineExports.Interface): unknown[] {
  const answer = rl.question('> ');
  const answerWithSignal = rl.question('> ', { signal: new AbortController().signal });

  type _Assertions = [
    Expect<Equal<typeof answer, CancelablePromise<string>>>,
    Expect<Equal<typeof answerWithSignal, CancelablePromise<string>>>,
  ];

  return [answer, answerWithSignal];
}

/** A stream shaped enough like a TTY for readline's raw-mode path to engage. */
class FakeTTYInput extends Readable {
  isTTY = true;
  isRaw = false;

  _read(): void {}

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

function makeSink(): Writable {
  return new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
}

describe('@cancjs/node/readline module exports', () => {
  it('question resolves the typed answer for scripted stdin', async () => {
    const input = new FakeTTYInput();
    const rl = readlineExports.createInterface({ input, output: makeSink(), terminal: true });
    try {
      const p = rl.question('favorite food? ');
      expect(p).toBeInstanceOf(CancelablePromise);

      input.push('pierogi\n');
      const answer: string = await p;
      expect(answer).toBe('pierogi');
    } finally {
      rl.close();
    }
  });

  it('canceling a pending question rejects CancelError, not AbortError', async () => {
    const input = new FakeTTYInput();
    const rl = readlineExports.createInterface({ input, output: makeSink(), terminal: true });
    try {
      const p = rl.question('never answered? ');
      p.cancel('stop');

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }
      expect(isCancelError(caught)).toBe(true);
    } finally {
      rl.close();
    }
  });

  it('stdin is restored: isRaw and the line listener count both return to their prior values', async () => {
    const input = new FakeTTYInput();
    const rl = readlineExports.createInterface({ input, output: makeSink(), terminal: true });
    try {
      const priorRaw = input.isRaw;
      const priorLineListeners = rl.listenerCount('line');

      const p = rl.question('canceled? ');
      p.cancel('stop');

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }
      expect(isCancelError(caught)).toBe(true);

      expect(input.isRaw).toBe(priorRaw);
      expect(rl.listenerCount('line')).toBe(priorLineListeners);
    } finally {
      rl.close();
    }
  });

  it('a canceled question does not consume the next line', async () => {
    const input = new FakeTTYInput();
    const rl = readlineExports.createInterface({ input, output: makeSink(), terminal: true });
    try {
      // line-A arrives while `first` is still the pending reader; canceling before it settles must
      // not swallow it, so the next question still sees it.
      const first = rl.question('first? ');
      input.push('line-A\n');
      first.cancel('stop');

      let caught: unknown;
      try {
        await first;
      } catch (err) {
        caught = err;
      }
      expect(isCancelError(caught)).toBe(true);

      const second = await rl.question('second? ');
      expect(second).toBe('line-A');

      // the reader must be registered before the write, or nothing is listening when it arrives
      const thirdPending = rl.question('third? ');
      input.push('line-B\n');
      const third = await thirdPending;
      expect(third).toBe('line-B');
    } finally {
      rl.close();
    }
  });

  it('type fixture: question(...) resolves exactly CancelablePromise<string>', () => {
    // never called; its existence as a function value is enough to keep it from being flagged
    // unused while tsc still checks its body
    expect(typeof typeAssertions).toBe('function');
  });
});
