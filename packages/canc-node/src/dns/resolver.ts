import type { AnyRecord, CaaRecord, MxRecord, NaptrRecord, ResolverOptions, SoaRecord, SrvRecord } from 'node:dns';
import nodeDnsPromises from 'node:dns/promises';

import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import { gated } from '../gate';
import type { TNodeFn } from '../wrap';
import type { IResolve4Fn, IResolve6Fn, IResolveFn, TResolveTlsaFn } from './records';

// dnsPromises.Resolver is a different class from dns.Resolver: only this one answers with promises
const NodeResolver = nodeDnsPromises.Resolver;

/**
 * A DNS resolver whose queries return cancelable promises.
 *
 * Each query runs on a private node resolver that shares this one's servers and local address.
 * Node's `cancel` is per resolver, so this is the only way to stop one query without rejecting its
 * siblings: canceling a query leaves every other query on this resolver running. Calling `cancel()`
 * on the resolver itself still stops all of its outstanding queries.
 */
export interface ICancelableResolver {
  /** Cancel every outstanding query on this resolver. */
  cancel(): void;
  /** Get the addresses of the servers this resolver queries. */
  getServers(): string[];
  /** Set the addresses of the servers to query, replacing the current list. */
  setServers(servers: readonly string[]): void;
  /** Bind outgoing queries to a local address. */
  setLocalAddress(ipv4?: string, ipv6?: string): void;

  resolve: IResolveFn;
  resolve4: IResolve4Fn;
  resolve6: IResolve6Fn;
  resolveAny(hostname: string): CancelablePromise<AnyRecord[], Unlisted>;
  resolveCaa(hostname: string): CancelablePromise<CaaRecord[], Unlisted>;
  resolveCname(hostname: string): CancelablePromise<string[], Unlisted>;
  resolveMx(hostname: string): CancelablePromise<MxRecord[], Unlisted>;
  resolveNaptr(hostname: string): CancelablePromise<NaptrRecord[], Unlisted>;
  resolveNs(hostname: string): CancelablePromise<string[], Unlisted>;
  resolvePtr(hostname: string): CancelablePromise<string[], Unlisted>;
  resolveSoa(hostname: string): CancelablePromise<SoaRecord, Unlisted>;
  resolveSrv(hostname: string): CancelablePromise<SrvRecord[], Unlisted>;
  resolveTlsa: TResolveTlsaFn;
  resolveTxt(hostname: string): CancelablePromise<string[][], Unlisted>;
  reverse(ip: string): CancelablePromise<string[], Unlisted>;
}

/** Constructor side of {@link ICancelableResolver}, mirroring node's own `Resolver`. */
export interface ICancelableResolverCtor {
  new (options?: ResolverOptions): ICancelableResolver;
  readonly prototype: ICancelableResolver;
}

/**
 * Build the real resolver and give it our prototype.
 *
 * Node's `Resolver` is an ES6 class, so `class extends` compiled down to es5 calls it with `.call`
 * and throws at runtime. `Reflect.construct` runs the real constructor without that call, and
 * passing `new.target` keeps a further subclass's prototype.
 */
function CancelableResolver(this: unknown, options?: ResolverOptions): unknown {
  return Reflect.construct(NodeResolver, [options], new.target ?? CancelableResolver);
}

type TNodeResolver = InstanceType<typeof NodeResolver>;

/** Local address each owner was given, kept because node offers no getter to read it back. */
const localAddresses = new WeakMap<object, [string | undefined, string | undefined]>();

/** Private resolvers each owner has in flight, so the owner's own `cancel()` still reaches them. */
const inFlight = new WeakMap<object, Set<TNodeResolver>>();

function inFlightFor(owner: object): Set<TNodeResolver> {
  let queries = inFlight.get(owner);
  if (!queries) {
    queries = new Set<TNodeResolver>();
    inFlight.set(owner, queries);
  }
  return queries;
}

/** A fresh node resolver answering the way `owner` is configured to. */
function privateResolverFor(owner: ICancelableResolver): TNodeResolver {
  const query = new NodeResolver();
  query.setServers(owner.getServers());

  const local = localAddresses.get(owner);
  if (local) {
    query.setLocalAddress(local[0], local[1]);
  }
  return query;
}

const proto = Object.create(NodeResolver.prototype) as Record<string, unknown>;

CancelableResolver.prototype = proto;
proto.constructor = CancelableResolver;

proto.cancel = function cancelAll(this: ICancelableResolver): void {
  const queries = inFlightFor(this);
  for (const query of [...queries]) {
    query.cancel();
  }
  queries.clear();
  NodeResolver.prototype.cancel.call(this);
};

proto.setLocalAddress = function setLocalAddress(this: ICancelableResolver, ipv4?: string, ipv6?: string): void {
  localAddresses.set(this, [ipv4, ipv6]);
  NodeResolver.prototype.setLocalAddress.call(this, ipv4, ipv6);
};

/**
 * Wrap one inherited query method so it answers with a cancelable promise.
 *
 * @param name - Method on node's `Resolver.prototype`, called with our instance as its receiver.
 */
function stoppable(
  name: string,
): (this: ICancelableResolver, ...args: unknown[]) => CancelablePromise<unknown, Unlisted> {
  const nodeMethod = (NodeResolver.prototype as unknown as Record<string, TNodeFn>)[name];

  return function stoppableCall(this: ICancelableResolver, ...args: unknown[]): CancelablePromise<unknown, Unlisted> {
    return new CancelablePromise((resolve, _reject, { handleCancel }) => {
      // one private resolver per query, so canceling this one stops only its own retries
      const query = privateResolverFor(this);
      const queries = inFlightFor(this);
      queries.add(query);

      const finished = () => {
        queries.delete(query);
      };

      handleCancel(() => {
        finished();
        query.cancel();
      });

      const answer = (nodeMethod as unknown as (...a: unknown[]) => Promise<unknown>).apply(query, args);
      answer.then(finished, finished);
      resolve(answer);
    });
  };
}

const QUERY_METHODS = [
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
  'resolveCaa',
  'resolveCname',
  'resolveMx',
  'resolveNaptr',
  'resolveNs',
  'resolvePtr',
  'resolveSoa',
  'resolveSrv',
  'resolveTxt',
  'reverse',
];

for (const name of QUERY_METHODS) {
  proto[name] = stoppable(name);
}

// backported to the 22 and 24 lines and absent on deno and bun; gated on the member being there
// rather than on the running major, so a runtime implementing it keeps it
const hasResolveTlsa = typeof (NodeResolver.prototype as unknown as Record<string, unknown>).resolveTlsa === 'function';

// wrapping an absent method is safe: gated hands back the throwing stub, which never applies it
proto.resolveTlsa = gated(hasResolveTlsa, 'resolveTlsa', '22', () => stoppable('resolveTlsa'), 'promise');

export const Resolver = CancelableResolver as unknown as ICancelableResolverCtor;
export type Resolver = ICancelableResolver;
