# Public surface: @cancjs/node ./dns

Generated. Do not edit by hand.

- Declarations: `packages/canc-node/dist/types/dns/index.d.ts`
- Exports: 47

## `ADDRGETNETWORKPARAMS` (const)

```text
"EADDRGETNETWORKPARAMS"
```

## `BADFAMILY` (const)

```text
"EBADFAMILY"
```

## `BADFLAGS` (const)

```text
"EBADFLAGS"
```

## `BADHINTS` (const)

```text
"EBADHINTS"
```

## `BADNAME` (const)

```text
"EBADNAME"
```

## `BADQUERY` (const)

```text
"EBADQUERY"
```

## `BADRESP` (const)

```text
"EBADRESP"
```

## `BADSTR` (const)

```text
"EBADSTR"
```

## `CANCELLED` (const)

```text
"ECANCELLED"
```

## `CONNREFUSED` (const)

```text
"ECONNREFUSED"
```

## `DESTRUCTION` (const)

```text
"EDESTRUCTION"
```

## `EOF` (const)

```text
"EOF"
```

## `FILE` (const)

```text
"EFILE"
```

## `FORMERR` (const)

```text
"EFORMERR"
```

## `ITlsaRecord` (interface)

```text
readonly certUsage: number
readonly data: Buffer<ArrayBufferLike>
readonly match: number
readonly selector: number
```

## `LOADIPHLPAPI` (const)

```text
"ELOADIPHLPAPI"
```

## `NODATA` (const)

```text
"ENODATA"
```

## `NOMEM` (const)

```text
"ENOMEM"
```

## `NONAME` (const)

```text
"ENONAME"
```

## `NOTFOUND` (const)

```text
"ENOTFOUND"
```

## `NOTIMP` (const)

```text
"ENOTIMP"
```

## `NOTINITIALIZED` (const)

```text
"ENOTINITIALIZED"
```

## `REFUSED` (const)

```text
"EREFUSED"
```

## `Resolver` (type)

```text
cancel: () => void
getServers: () => string[]
resolve: IResolveFn
resolve4: IResolve4Fn
resolve6: IResolve6Fn
resolveAny: (hostname: string) => CancelablePromise<AnyRecord[]>
resolveCaa: (hostname: string) => CancelablePromise<CaaRecord[]>
resolveCname: (hostname: string) => CancelablePromise<string[]>
resolveMx: (hostname: string) => CancelablePromise<MxRecord[]>
resolveNaptr: (hostname: string) => CancelablePromise<NaptrRecord[]>
resolveNs: (hostname: string) => CancelablePromise<string[]>
resolvePtr: (hostname: string) => CancelablePromise<string[]>
resolveSoa: (hostname: string) => CancelablePromise<SoaRecord>
resolveSrv: (hostname: string) => CancelablePromise<SrvRecord[]>
resolveTlsa: TResolveTlsaFn
resolveTxt: (hostname: string) => CancelablePromise<string[][]>
reverse: (ip: string) => CancelablePromise<string[]>
setLocalAddress: (ipv4?: string, ipv6?: string) => void
setServers: (servers: readonly string[]) => void
```

## `SERVFAIL` (const)

```text
"ESERVFAIL"
```

## `TIMEOUT` (const)

```text
"ETIMEOUT"
```

## `getDefaultResultOrder` (const)

```text
(): "ipv4first" | "verbatim"
```

## `getServers` (const)

```text
(): Array<string>
```

## `lookup` (const)

```text
(hostname: string, family: number): CancelablePromise<LookupAddress, never>
(hostname: string, options: LookupOneOptions): CancelablePromise<LookupAddress, never>
(hostname: string, options: LookupAllOptions): CancelablePromise<Array<LookupAddress>, never>
(hostname: string, options: LookupOptions): CancelablePromise<Array<LookupAddress> | LookupAddress, never>
(hostname: string): CancelablePromise<LookupAddress, never>
```

## `lookupService` (const)

```text
(address: string, port: number): CancelablePromise<{ hostname: string; service: string; }, never>
```

## `resolve` (const)

```text
(hostname: string): CancelablePromise<Array<string>, never>
(hostname: string, rrtype: "A" | "AAAA" | "CNAME" | "NS" | "PTR"): CancelablePromise<Array<string>, never>
(hostname: string, rrtype: "ANY"): CancelablePromise<Array<AnyRecord>, never>
(hostname: string, rrtype: "CAA"): CancelablePromise<Array<CaaRecord>, never>
(hostname: string, rrtype: "MX"): CancelablePromise<Array<MxRecord>, never>
(hostname: string, rrtype: "NAPTR"): CancelablePromise<Array<NaptrRecord>, never>
(hostname: string, rrtype: "SOA"): CancelablePromise<SoaRecord, never>
(hostname: string, rrtype: "SRV"): CancelablePromise<Array<SrvRecord>, never>
(hostname: string, rrtype: "TXT"): CancelablePromise<Array<Array<string>>, never>
(hostname: string, rrtype: string): CancelablePromise<Array<AnyRecord> | Array<Array<string>> | Array<CaaRecord> | Array<MxRecord> | Array<NaptrRecord> | Array<SrvRecord> | Array<string> | SoaRecord, never>
```

## `resolve4` (const)

```text
(hostname: string): CancelablePromise<Array<string>, never>
(hostname: string, options: ResolveWithTtlOptions): CancelablePromise<Array<RecordWithTtl>, never>
(hostname: string, options: ResolveOptions): CancelablePromise<Array<RecordWithTtl> | Array<string>, never>
```

## `resolve6` (const)

```text
(hostname: string): CancelablePromise<Array<string>, never>
(hostname: string, options: ResolveWithTtlOptions): CancelablePromise<Array<RecordWithTtl>, never>
(hostname: string, options: ResolveOptions): CancelablePromise<Array<RecordWithTtl> | Array<string>, never>
```

## `resolveAny` (const)

```text
(hostname: string): CancelablePromise<Array<AnyRecord>, never>
```

## `resolveCaa` (const)

```text
(hostname: string): CancelablePromise<Array<CaaRecord>, never>
```

## `resolveCname` (const)

```text
(hostname: string): CancelablePromise<Array<string>, never>
```

## `resolveMx` (const)

```text
(hostname: string): CancelablePromise<Array<MxRecord>, never>
```

## `resolveNaptr` (const)

```text
(hostname: string): CancelablePromise<Array<NaptrRecord>, never>
```

## `resolveNs` (const)

```text
(hostname: string): CancelablePromise<Array<string>, never>
```

## `resolvePtr` (const)

```text
(hostname: string): CancelablePromise<Array<string>, never>
```

## `resolveSoa` (const)

```text
(hostname: string): CancelablePromise<SoaRecord, never>
```

## `resolveSrv` (const)

```text
(hostname: string): CancelablePromise<Array<SrvRecord>, never>
```

## `resolveTlsa` (const)

```text
(hostname: string): CancelablePromise<Array<ITlsaRecord>, never>
```

## `resolveTxt` (const)

```text
(hostname: string): CancelablePromise<Array<Array<string>>, never>
```

## `reverse` (const)

```text
(ip: string): CancelablePromise<Array<string>, never>
```

## `setDefaultResultOrder` (const)

```text
(order: "ipv4first" | "ipv6first" | "verbatim"): void
```

## `setServers` (const)

```text
(servers: ReadonlyArray<string>): void
```
