import type {
  AnyRecord,
  CaaRecord,
  LookupAddress,
  LookupAllOptions,
  LookupOneOptions,
  LookupOptions,
  MxRecord,
  NaptrRecord,
  SoaRecord,
  SrvRecord,
} from 'node:dns';
import nodeDnsPromises from 'node:dns/promises';

import { CancelablePromise } from '@cancjs/promise';

import { gated } from '../gate';
import { adopted, TNodeFn } from '../wrap';
import type { IResolve4Fn, IResolve6Fn, IResolveFn, TResolveTlsaFn } from './records';

export type { ITlsaRecord } from './records';
export { Resolver } from './resolver';

interface ILookupFn {
  (hostname: string, family: number): CancelablePromise<LookupAddress>;
  (hostname: string, options: LookupOneOptions): CancelablePromise<LookupAddress>;
  (hostname: string, options: LookupAllOptions): CancelablePromise<LookupAddress[]>;
  (hostname: string, options: LookupOptions): CancelablePromise<LookupAddress | LookupAddress[]>;
  (hostname: string): CancelablePromise<LookupAddress>;
}

type TLookupServiceFn = (address: string, port: number) => CancelablePromise<{ hostname: string; service: string }>;

// there is no signal anywhere in node:dns; `adopted` stops the waiting on cancel, and the query
// itself runs to completion against node's own internal resolver, same guarantee node gives a call
// nothing can interrupt
const dnsAny = nodeDnsPromises as unknown as Record<string, unknown>;

/**
 * Resolve a member of the default `dnsPromises` resolver on every call, not once at module load.
 *
 * `setServers` swaps in a brand new default `Resolver` and repoints every one of these members at
 * it, so a reference captured up front keeps calling the resolver that existed before that swap.
 * Reading `nodeDnsPromises[name]` inside the call, as a method call so node keeps its own receiver,
 * is what lets a later `setServers` actually take effect.
 */
function viaDns(name: string): TNodeFn {
  return (...args: unknown[]) => (nodeDnsPromises as unknown as Record<string, TNodeFn>)[name](...args);
}

export const resolve = adopted(viaDns('resolve')) as IResolveFn;
export const resolve4 = adopted(viaDns('resolve4')) as IResolve4Fn;
export const resolve6 = adopted(viaDns('resolve6')) as IResolve6Fn;
export const resolveAny = adopted(viaDns('resolveAny')) as (hostname: string) => CancelablePromise<AnyRecord[]>;
export const resolveCaa = adopted(viaDns('resolveCaa')) as (hostname: string) => CancelablePromise<CaaRecord[]>;
export const resolveCname = adopted(viaDns('resolveCname')) as (hostname: string) => CancelablePromise<string[]>;
export const resolveMx = adopted(viaDns('resolveMx')) as (hostname: string) => CancelablePromise<MxRecord[]>;
export const resolveNaptr = adopted(viaDns('resolveNaptr')) as (hostname: string) => CancelablePromise<NaptrRecord[]>;
export const resolveNs = adopted(viaDns('resolveNs')) as (hostname: string) => CancelablePromise<string[]>;
export const resolvePtr = adopted(viaDns('resolvePtr')) as (hostname: string) => CancelablePromise<string[]>;
export const resolveSoa = adopted(viaDns('resolveSoa')) as (hostname: string) => CancelablePromise<SoaRecord>;
export const resolveSrv = adopted(viaDns('resolveSrv')) as (hostname: string) => CancelablePromise<SrvRecord[]>;
export const resolveTxt = adopted(viaDns('resolveTxt')) as (hostname: string) => CancelablePromise<string[][]>;
export const reverse = adopted(viaDns('reverse')) as (ip: string) => CancelablePromise<string[]>;
export const lookup = adopted(viaDns('lookup')) as ILookupFn;
export const lookupService = adopted(viaDns('lookupService')) as TLookupServiceFn;

// backported to the 22 and 24 lines and absent on deno and bun; gated on the feature actually
// present rather than the running major, so a runtime implementing it without node's version
// string still gets it
const hasResolveTlsa = typeof dnsAny.resolveTlsa === 'function';
export const resolveTlsa = gated(
  hasResolveTlsa,
  'resolveTlsa',
  '22',
  () => adopted(viaDns('resolveTlsa')) as TResolveTlsaFn,
  'promise',
) as TResolveTlsaFn;

// synchronous, and (unlike the resolve family) not repointed by setServers, but read live all the
// same so the two groups do not silently diverge if that ever changes
export const getServers = (): string[] => nodeDnsPromises.getServers();
export const setServers = (servers: readonly string[]): void => nodeDnsPromises.setServers(servers);
export const getDefaultResultOrder = (): ReturnType<typeof nodeDnsPromises.getDefaultResultOrder> =>
  nodeDnsPromises.getDefaultResultOrder();
export const setDefaultResultOrder = (order: Parameters<typeof nodeDnsPromises.setDefaultResultOrder>[0]): void =>
  nodeDnsPromises.setDefaultResultOrder(order);

export const NODATA = nodeDnsPromises.NODATA;
export const FORMERR = nodeDnsPromises.FORMERR;
export const SERVFAIL = nodeDnsPromises.SERVFAIL;
export const NOTFOUND = nodeDnsPromises.NOTFOUND;
export const NOTIMP = nodeDnsPromises.NOTIMP;
export const REFUSED = nodeDnsPromises.REFUSED;
export const BADQUERY = nodeDnsPromises.BADQUERY;
export const BADNAME = nodeDnsPromises.BADNAME;
export const BADFAMILY = nodeDnsPromises.BADFAMILY;
export const BADRESP = nodeDnsPromises.BADRESP;
export const CONNREFUSED = nodeDnsPromises.CONNREFUSED;
export const TIMEOUT = nodeDnsPromises.TIMEOUT;
export const EOF = nodeDnsPromises.EOF;
export const FILE = nodeDnsPromises.FILE;
export const NOMEM = nodeDnsPromises.NOMEM;
export const DESTRUCTION = nodeDnsPromises.DESTRUCTION;
export const BADSTR = nodeDnsPromises.BADSTR;
export const BADFLAGS = nodeDnsPromises.BADFLAGS;
export const NONAME = nodeDnsPromises.NONAME;
export const BADHINTS = nodeDnsPromises.BADHINTS;
export const NOTINITIALIZED = nodeDnsPromises.NOTINITIALIZED;
export const LOADIPHLPAPI = nodeDnsPromises.LOADIPHLPAPI;
export const ADDRGETNETWORKPARAMS = nodeDnsPromises.ADDRGETNETWORKPARAMS;
export const CANCELLED = nodeDnsPromises.CANCELLED;
