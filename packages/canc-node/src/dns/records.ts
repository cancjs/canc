import type {
  AnyRecord,
  CaaRecord,
  MxRecord,
  NaptrRecord,
  RecordWithTtl,
  ResolveOptions,
  ResolveWithTtlOptions,
  SoaRecord,
  SrvRecord,
} from 'node:dns';

import type { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';

/**
 * One certificate association record from a TLSA query.
 *
 * Node ships `resolveTlsa` at runtime from release line 22 on, but the installed `@types/node`
 * predates the member, so the shape is declared here from the documented wire fields rather than
 * imported.
 */
export interface ITlsaRecord {
  readonly certUsage: number;
  readonly selector: number;
  readonly match: number;
  readonly data: Buffer;
}

// node's own overloads narrow the return by the rrtype literal, so each interface below rebuilds
// one function's ladder with CancelablePromise in place of Promise, shared by the module-level
// export and the Resolver method node publishes identically
export interface IResolveFn {
  (hostname: string): CancelablePromise<string[], Unlisted>;
  (hostname: string, rrtype: 'A' | 'AAAA' | 'CNAME' | 'NS' | 'PTR'): CancelablePromise<string[], Unlisted>;
  (hostname: string, rrtype: 'ANY'): CancelablePromise<AnyRecord[], Unlisted>;
  (hostname: string, rrtype: 'CAA'): CancelablePromise<CaaRecord[], Unlisted>;
  (hostname: string, rrtype: 'MX'): CancelablePromise<MxRecord[], Unlisted>;
  (hostname: string, rrtype: 'NAPTR'): CancelablePromise<NaptrRecord[], Unlisted>;
  (hostname: string, rrtype: 'SOA'): CancelablePromise<SoaRecord, Unlisted>;
  (hostname: string, rrtype: 'SRV'): CancelablePromise<SrvRecord[], Unlisted>;
  (hostname: string, rrtype: 'TXT'): CancelablePromise<string[][], Unlisted>;
  (
    hostname: string,
    rrtype: string,
  ): CancelablePromise<
    string[] | CaaRecord[] | MxRecord[] | NaptrRecord[] | SoaRecord | SrvRecord[] | string[][] | AnyRecord[],
    Unlisted
  >;
}

export interface IResolve4Fn {
  (hostname: string): CancelablePromise<string[], Unlisted>;
  (hostname: string, options: ResolveWithTtlOptions): CancelablePromise<RecordWithTtl[], Unlisted>;
  (hostname: string, options: ResolveOptions): CancelablePromise<string[] | RecordWithTtl[], Unlisted>;
}

export interface IResolve6Fn {
  (hostname: string): CancelablePromise<string[], Unlisted>;
  (hostname: string, options: ResolveWithTtlOptions): CancelablePromise<RecordWithTtl[], Unlisted>;
  (hostname: string, options: ResolveOptions): CancelablePromise<string[] | RecordWithTtl[], Unlisted>;
}

export type TResolveTlsaFn = (hostname: string) => CancelablePromise<ITlsaRecord[], Unlisted>;
