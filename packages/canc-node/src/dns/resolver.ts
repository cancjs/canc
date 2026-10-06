import type { AnyRecord, CaaRecord, MxRecord, NaptrRecord, ResolverOptions, SoaRecord, SrvRecord } from 'node:dns';
import nodeDnsPromises from 'node:dns/promises';

import { CancelablePromise } from '@cancjs/promise';

import { gated } from '../gate';
import type { TNodeFn } from '../wrap';
import type { IResolve4Fn, IResolve6Fn, IResolveFn, TResolveTlsaFn } from './records';

// dnsPromises.Resolver is a different class from dns.Resolver: only this one answers with promises
const NodeResolver = nodeDnsPromises.Resolver;

/**
 * A DNS resolver whose queries return cancelable promises.
 *
 * Canceling a query calls node's `cancel`, which stops every query outstanding on the resolver
 * rather than the one being canceled, so sibling queries reject as well. Node has no per-query
 * cancel, and one resolver per query is the only way to isolate them.
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
  resolveAny(hostname: string): CancelablePromise<AnyRecord[]>;
  resolveCaa(hostname: string): CancelablePromise<CaaRecord[]>;
  resolveCname(hostname: string): CancelablePromise<string[]>;
  resolveMx(hostname: string): CancelablePromise<MxRecord[]>;
  resolveNaptr(hostname: string): CancelablePromise<NaptrRecord[]>;
  resolveNs(hostname: string): CancelablePromise<string[]>;
  resolvePtr(hostname: string): CancelablePromise<string[]>;
  resolveSoa(hostname: string): CancelablePromise<SoaRecord>;
  resolveSrv(hostname: string): CancelablePromise<SrvRecord[]>;
  resolveTlsa: TResolveTlsaFn;
  resolveTxt(hostname: string): CancelablePromise<string[][]>;
  reverse(ip: string): CancelablePromise<string[]>;
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

const proto = Object.create(NodeResolver.prototype) as Record<string, unknown>;

CancelableResolver.prototype = proto;
proto.constructor = CancelableResolver;

/**
 * Wrap one inherited query method so it answers with a cancelable promise.
 *
 * @param name - Method on node's `Resolver.prototype`, called with our instance as its receiver.
 */
function stoppable(name: string): (this: ICancelableResolver, ...args: unknown[]) => CancelablePromise<unknown> {
  const nodeMethod = (NodeResolver.prototype as unknown as Record<string, TNodeFn>)[name];

  return function stoppableCall(this: ICancelableResolver, ...args: unknown[]): CancelablePromise<unknown> {
    return new CancelablePromise((resolve, _reject, { handleCancel }) => {
      // node's cancel is per resolver, not per query, so this rejects the resolver's other queries
      // too; deferring it until they finish would leave this one running, which is worse
      handleCancel(() => {
        this.cancel();
      });

      resolve(nodeMethod.apply(this, args));
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
