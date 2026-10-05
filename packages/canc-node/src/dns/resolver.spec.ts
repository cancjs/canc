import dgram from 'node:dgram';
import nodeDnsPromises from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { CancelablePromise, isCancelError } from '@cancjs/promise';
import ts from 'typescript';

import { ICancelableResolver, ICancelableResolverCtor, Resolver } from './resolver';

const NodeResolver = nodeDnsPromises.Resolver;

// c-ares retries a query it gets no answer for; a short timeout keeps the retries close together
// so a test can wait for the next one instead of sleeping a fixed amount
const BLACK_HOLE_OPTIONS = { timeout: 100, tries: 30 };

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Never invoked: the point is that tsc resolves each overload at the exact call shape below, so a
// method accidentally widened to `unknown` or `any` fails compilation here rather than at a
// consumer's call site.
function typeAssertions(): unknown[] {
  const resolver = new Resolver();
  const addresses = resolver.resolve4('x');
  const withTtl = resolver.resolve4('x', { ttl: true });
  const mailServers = resolver.resolveMx('x');

  type _Assertions = [
    Expect<Equal<typeof addresses, CancelablePromise<string[]>>>,
    Expect<Equal<typeof withTtl, CancelablePromise<import('node:dns').RecordWithTtl[]>>>,
    Expect<Equal<typeof mailServers, CancelablePromise<import('node:dns').MxRecord[]>>>,
  ];

  return [addresses, withTtl, mailServers];
}

interface IBlackHole {
  readonly port: number;
  readonly count: () => number;
  readonly close: () => Promise<void>;
}

/** A UDP socket that records DNS queries and never answers, so every query stays pending. */
function startBlackHole(): Promise<IBlackHole> {
  return new Promise((resolveReady) => {
    const socket = dgram.createSocket('udp4');
    let received = 0;

    socket.on('message', () => {
      received += 1;
    });

    socket.bind(0, '127.0.0.1', () => {
      const address = socket.address();
      resolveReady({
        port: typeof address === 'string' ? 0 : address.port,
        count: () => received,
        close: () => new Promise<void>((resolveClosed) => socket.close(() => resolveClosed())),
      });
    });
  });
}

/**
 * Wait for an observation rather than for a duration, so the assertions do not depend on how much
 * CPU the suite gets while it runs.
 */
function waitFor(condition: () => boolean, label: string, timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolveReached, rejectTimedOut) => {
    const poll = (): void => {
      if (condition()) {
        resolveReached();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        rejectTimedOut(new Error(`timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, 20);
    };

    poll();
  });
}

function settle(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    (value) => value,
    (err: unknown) => err,
  );
}

const STILL_PENDING = Symbol('still pending');

/**
 * Bound a wait that a broken implementation would never end, so the assertion reports the real
 * problem instead of the suite hanging on a query with retries left.
 */
function within(promise: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: NodeJS.Timeout;

  return Promise.race([
    promise,
    new Promise((resolveLate) => {
      timer = setTimeout(() => resolveLate(STILL_PENDING), ms);
    }),
  ]).then((outcome) => {
    clearTimeout(timer);
    return outcome;
  });
}

function pointAt(resolver: ICancelableResolver, port: number): void {
  resolver.setServers([`127.0.0.1:${port}`]);
}

describe('@cancjs/node/dns Resolver', () => {
  jest.setTimeout(30000);

  it('is an instance of both our Resolver and node dns promises Resolver', () => {
    const resolver = new Resolver();

    expect(resolver instanceof Resolver).toBe(true);
    expect(resolver instanceof NodeResolver).toBe(true);
    expect(Object.getPrototypeOf(resolver)).toBe(Resolver.prototype);
  });

  it('keeps the inherited server accessors working after the prototype surgery', () => {
    const resolver = new Resolver();

    resolver.setServers(['1.1.1.1', '8.8.8.8']);

    expect(resolver.getServers()).toEqual(['1.1.1.1', '8.8.8.8']);
    expect(typeof resolver.cancel).toBe('function');
    expect(typeof resolver.setLocalAddress).toBe('function');
  });

  it('answers queries with cancelable promises, not node plain ones', async () => {
    const server = await startBlackHole();
    const resolver = new Resolver(BLACK_HOLE_OPTIONS);
    pointAt(resolver, server.port);

    const query = resolver.resolve4('shape.example.test');
    const settled = settle(query);

    try {
      expect(query).toBeInstanceOf(CancelablePromise);
      expect(typeof query.cancel).toBe('function');
    } finally {
      resolver.cancel();
      await settled;
      await server.close();
    }
  });

  it('really stops the query on cancel instead of only stopping the wait', async () => {
    // two black holes, one per resolver, so each resolver's query count is its own; the control
    // resolver is what proves a retry WOULD have been sent in the same window
    const canceledServer = await startBlackHole();
    const controlServer = await startBlackHole();

    const canceled = new Resolver(BLACK_HOLE_OPTIONS);
    const control = new Resolver(BLACK_HOLE_OPTIONS);
    pointAt(canceled, canceledServer.port);
    pointAt(control, controlServer.port);

    const canceledQuery = canceled.resolve4('stopped.example.test');
    const controlQuery = control.resolve4('running.example.test');
    const canceledSettled = settle(canceledQuery);
    const controlSettled = settle(controlQuery);

    try {
      await waitFor(() => canceledServer.count() >= 1 && controlServer.count() >= 1, 'both queries to be sent');

      const controlAtCancel = controlServer.count();
      canceledQuery.cancel('stop');

      expect(isCancelError(await within(canceledSettled, 5000))).toBe(true);

      const frozen = canceledServer.count();

      // the control needs two more retry rounds; an adopted wrapper would have kept retrying on the
      // canceled resolver over exactly the same span
      await waitFor(() => controlServer.count() >= controlAtCancel + 2, 'the control resolver to retry twice');

      expect(canceledServer.count()).toBe(frozen);
    } finally {
      canceled.cancel();
      control.cancel();
      await Promise.all([canceledSettled, controlSettled]);
      await canceledServer.close();
      await controlServer.close();
    }
  });

  it('rejects the sibling queries too, because node cancels per resolver', async () => {
    const server = await startBlackHole();
    const resolver = new Resolver(BLACK_HOLE_OPTIONS);
    pointAt(resolver, server.port);

    const first = resolver.resolve4('first.example.test');
    const second = resolver.resolve4('second.example.test');
    const firstSettled = settle(first);
    const secondSettled = settle(second);

    try {
      await waitFor(() => server.count() >= 2, 'both queries to be sent');

      first.cancel('stop');

      expect(isCancelError(await within(firstSettled, 5000))).toBe(true);

      // not a bug being asserted: node has no per-query cancel, and this is what callers will see
      const siblingError = (await within(secondSettled, 5000)) as NodeJS.ErrnoException;
      expect(siblingError).not.toBe(STILL_PENDING);
      expect(isCancelError(siblingError)).toBe(false);
      expect(siblingError.code).toBe('ECANCELLED');
    } finally {
      resolver.cancel();
      await Promise.all([firstSettled, secondSettled]);
      await server.close();
    }
  });

  it('constructs from the es5 downlevel emit without the class constructor error', () => {
    const source = fs.readFileSync(path.join(__dirname, 'resolver.ts'), 'utf8');
    const emitted = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        downlevelIteration: true,
        useDefineForClassFields: false,
        esModuleInterop: true,
        // the prose below talks about classes; stripping it keeps the next assertion about syntax
        removeComments: true,
      },
    }).outputText;

    expect(emitted).not.toMatch(/\bclass\s+\w/);

    const moduleExports: Record<string, unknown> = {};
    // compiled in this realm, so instanceof against the node class loaded above still means
    // something; jest's own require resolves the emit's relative imports from this directory
    const load = vm.compileFunction(emitted, ['exports', 'require', 'module', '__filename', '__dirname'], {
      filename: path.join(__dirname, 'resolver.es5.js'),
    }) as (
      exports: Record<string, unknown>,
      req: NodeJS.Require,
      module: { exports: Record<string, unknown> },
      filename: string,
      dirname: string,
    ) => void;

    load(moduleExports, require, { exports: moduleExports }, __filename, __dirname);

    const Es5Resolver = moduleExports.Resolver as ICancelableResolverCtor;
    const resolver = new Es5Resolver();

    expect(resolver instanceof NodeResolver).toBe(true);
    expect(resolver instanceof Es5Resolver).toBe(true);
    resolver.setServers(['9.9.9.9']);
    expect(resolver.getServers()).toEqual(['9.9.9.9']);
  });

  it('type fixture: resolve4 and resolveMx return exactly the cancelable types node publishes', () => {
    // never called; its existence as a function value is enough to keep it from being flagged
    // unused while tsc still checks its body
    expect(typeof typeAssertions).toBe('function');
  });
});
