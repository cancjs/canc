import { runInThisContext } from 'vm';

import { debounce, throttle } from './index';

// jest fakes setImmediate with the other timers, and node reports a rejection on a real turn
const realSetImmediate = setImmediate;

const turn = (): Promise<void> => new Promise<void>((resolve) => realSetImmediate(resolve));

interface IInvoke {
  at: number;
  arg: number;
}

// Moves the fake clock to each listed time and calls there, then lets every pending timer run out
function driveCalls(call: (arg: number) => unknown, times: number[]): void {
  for (const time of times) {
    jest.advanceTimersByTime(time - Date.now());
    call(time);
  }
  jest.advanceTimersByTime(10_000);
}

function recorder(): { invokes: IInvoke[]; fn: (arg: number) => number } {
  const invokes: IInvoke[] = [];

  return {
    invokes,
    fn: (arg: number) => {
      invokes.push({ at: Date.now(), arg });

      return arg;
    },
  };
}

describe('debounce and throttle timing (native)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('throttle(100) against the invoke times a rate limiter owes', () => {
    it.each([
      {
        name: 'calls every 90ms invoke once per 100ms with the newest args of each period',
        calls: [0, 90, 180, 270, 360, 450, 540, 630, 720, 810],
        invokeAt: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900],
        invokeArgs: [0, 90, 180, 270, 360, 450, 540, 630, 720, 810],
      },
      {
        name: 'calls every 30ms invoke once per 100ms',
        calls: [0, 30, 60, 90, 120, 150, 180, 210, 240],
        invokeAt: [0, 100, 200, 300],
        invokeArgs: [0, 90, 180, 240],
      },
      {
        name: 'a call after a quiet period invokes at once, then the next waits a full interval',
        calls: [0, 500, 520],
        invokeAt: [0, 500, 600],
        invokeArgs: [0, 500, 520],
      },
    ])('$name', ({ calls, invokeAt, invokeArgs }) => {
      const { invokes, fn } = recorder();
      const throttled = throttle(fn, 100);

      driveCalls(throttled, calls);

      expect(invokes.map((invoke) => invoke.at)).toEqual(invokeAt);
      expect(invokes.map((invoke) => invoke.arg)).toEqual(invokeArgs);
    });
  });

  describe('flush', () => {
    it('invokes the pending call once and keeps the interval for the next one', () => {
      const { invokes, fn } = recorder();
      const throttled = throttle(fn, 100);

      throttled(1);
      jest.advanceTimersByTime(10);
      throttled(2);
      jest.advanceTimersByTime(10);
      throttled.flush();
      throttled(3);
      jest.advanceTimersByTime(99);

      expect(invokes).toEqual([
        { at: 0, arg: 1 },
        { at: 20, arg: 2 },
      ]);

      jest.advanceTimersByTime(1);

      expect(invokes).toEqual([
        { at: 0, arg: 1 },
        { at: 20, arg: 2 },
        { at: 120, arg: 3 },
      ]);
    });

    it('a debounce flush invokes once and the timer does not invoke again', () => {
      const { invokes, fn } = recorder();
      const debounced = debounce(fn, 100);

      debounced(1);
      jest.advanceTimersByTime(10);
      debounced(2);
      jest.advanceTimersByTime(10);
      debounced.flush();
      jest.advanceTimersByTime(1000);

      expect(invokes).toEqual([{ at: 20, arg: 2 }]);
    });

    it('with trailing false a flush invokes nothing and drops the pending call', async () => {
      const { invokes, fn } = recorder();
      const debounced = debounce(fn, 100, { leading: true, trailing: false });

      debounced(1);
      const dropped = debounced(2);
      const outcome = dropped.then(
        () => 'resolved',
        (error: unknown) => error,
      );
      debounced.flush();
      jest.advanceTimersByTime(1000);

      expect(invokes).toEqual([{ at: 0, arg: 1 }]);
      expect(await outcome).toHaveProperty('name', 'SupersededError');
    });

    it('with trailing false and no leading a flush invokes nothing', () => {
      const { invokes, fn } = recorder();
      const debounced = debounce(fn, 100, { trailing: false });

      debounced(1).catch(() => undefined);
      debounced.flush();
      jest.advanceTimersByTime(1000);

      expect(invokes).toEqual([]);
    });
  });

  describe('receiver and re-entry', () => {
    it('forwards the receiver of the call that is invoked', async () => {
      const target = {
        tag: 'target',
        read: debounce(function (this: { tag: string }) {
          return this.tag;
        }, 10),
      };

      const result = target.read();
      jest.advanceTimersByTime(10);

      await expect(result).resolves.toBe('target');
    });

    it('forwards the receiver through throttle too', async () => {
      const target = {
        tag: 'target',
        read: throttle(function (this: { tag: string }) {
          return this.tag;
        }, 10),
      };

      await expect(target.read()).resolves.toBe('target');
    });

    it('a call made from inside fn gets its own result and leaves the running call alone', async () => {
      let inner: Promise<string> | undefined;
      const debounced = debounce((tag: string) => {
        if (tag === 'outer') {
          inner = debounced('inner');
        }

        return `result-${tag}`;
      }, 10);

      const outer = debounced('outer');
      jest.advanceTimersByTime(10);

      await expect(outer).resolves.toBe('result-outer');

      jest.advanceTimersByTime(10);

      await expect(inner).resolves.toBe('result-inner');
    });

    it('a leading call that re-enters does not start a second window', () => {
      const invokes: IInvoke[] = [];
      let calls = 0;
      const debounced = debounce(
        (arg: number) => {
          calls++;
          invokes.push({ at: Date.now(), arg });
          if (calls === 1) {
            debounced(arg + 1).catch(() => undefined);
          }
        },
        10,
        { leading: true },
      );

      debounced(1);
      jest.advanceTimersByTime(1000);

      expect(invokes).toEqual([
        { at: 0, arg: 1 },
        { at: 10, arg: 2 },
      ]);
      expect(debounced.isPending).toBe(false);
    });
  });

  describe('superseded calls', () => {
    it('are not reported as unhandled when nobody subscribed, and still reject for a subscriber', async () => {
      const debounced = debounce((arg: number) => arg, 10);

      const first = debounced(1);
      debounced(2);
      jest.useRealTimers();
      // jest fails a test whose promise goes unhandled, so reaching the end proves none did
      await turn();
      await turn();

      await expect(first).rejects.toHaveProperty('name', 'SupersededError');
    });
  });

  describe('unobserved calls', () => {
    // the test sandbox has its own `process`, the runtime reports rejections on the host one
    const host = runInThisContext('process') as NodeJS.Process;
    let saved: NodeJS.UnhandledRejectionListener[];
    let unhandled: jest.Mock;

    beforeEach(() => {
      saved = host.listeners('unhandledRejection');
      host.removeAllListeners('unhandledRejection');
      unhandled = jest.fn();
      host.on('unhandledRejection', unhandled);
    });

    afterEach(() => {
      host.removeAllListeners('unhandledRejection');
      for (const listener of saved) host.on('unhandledRejection', listener);
    });

    const failing: Array<[string, () => never | Promise<never>]> = [
      [
        'throws',
        () => {
          throw new Error('boom');
        },
      ],
      ['rejects', () => Promise.reject(new Error('boom'))],
    ];

    describe.each([
      ['debounce', debounce],
      ['throttle', throttle],
    ])('%s', (_name, wrap) => {
      it.each(failing)('reports one unhandled rejection per call when fn %s', async (_how, fn) => {
        const wrapped = wrap(fn, 10, { leading: true, trailing: false });

        wrapped();
        jest.advanceTimersByTime(20);
        wrapped();
        jest.advanceTimersByTime(20);
        jest.useRealTimers();
        await turn();
        await turn();

        expect(unhandled).toHaveBeenCalledTimes(2);
      });

      it('reports nothing for a superseded call, and an awaiting caller sees SupersededError', async () => {
        const wrapped = wrap(() => Promise.reject(new Error('boom')), 10, { leading: false });

        wrapped();
        const awaited = wrapped();
        wrapped(); // supersedes both calls above, then runs fn and fails
        const outcome = awaited.then(
          () => undefined,
          (e: unknown) => e,
        );
        jest.advanceTimersByTime(20);
        jest.useRealTimers();
        await turn();
        await turn();

        expect(await outcome).toHaveProperty('name', 'SupersededError');
        // only the call that ran fn surfaces its failure
        expect(unhandled).toHaveBeenCalledTimes(1);
        expect(unhandled.mock.calls[0][0]).toHaveProperty('message', 'boom');
      });
    });
  });

  describe('typing', () => {
    it('returns a promise with catch and finally', async () => {
      const debounced = debounce(() => 1, 10);
      const throttled = throttle(() => 1, 10);

      debounced().catch(() => undefined);
      throttled().finally(() => undefined);
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(typeof debounced().catch).toBe('function');
    });
  });
});
