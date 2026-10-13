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
resolveAny: (hostname: string) => CancelablePromise<AnyRecord[], Unlisted>
resolveCaa: (hostname: string) => CancelablePromise<CaaRecord[], Unlisted>
resolveCname: (hostname: string) => CancelablePromise<string[], Unlisted>
resolveMx: (hostname: string) => CancelablePromise<MxRecord[], Unlisted>
resolveNaptr: (hostname: string) => CancelablePromise<NaptrRecord[], Unlisted>
resolveNs: (hostname: string) => CancelablePromise<string[], Unlisted>
resolvePtr: (hostname: string) => CancelablePromise<string[], Unlisted>
resolveSoa: (hostname: string) => CancelablePromise<SoaRecord, Unlisted>
resolveSrv: (hostname: string) => CancelablePromise<SrvRecord[], Unlisted>
resolveTlsa: TResolveTlsaFn
resolveTxt: (hostname: string) => CancelablePromise<string[][], Unlisted>
reverse: (ip: string) => CancelablePromise<string[], Unlisted>
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
(hostname: string, family: number): CancelablePromise<LookupAddress, Unlisted>
(hostname: string, options: LookupOneOptions): CancelablePromise<LookupAddress, Unlisted>
(hostname: string, options: LookupAllOptions): CancelablePromise<Array<LookupAddress>, Unlisted>
(hostname: string, options: LookupOptions): CancelablePromise<Array<LookupAddress> | LookupAddress, Unlisted>
(hostname: string): CancelablePromise<LookupAddress, Unlisted>
```

## `lookupService` (const)

```text
(address: string, port: number): CancelablePromise<{ hostname: string; service: string; }, Unlisted>
```

## `resolve` (const)

```text
(hostname: string): CancelablePromise<Array<string>, Unlisted>
(hostname: string, rrtype: "A" | "AAAA" | "CNAME" | "NS" | "PTR"): CancelablePromise<Array<string>, Unlisted>
(hostname: string, rrtype: "ANY"): CancelablePromise<Array<AnyRecord>, Unlisted>
(hostname: string, rrtype: "CAA"): CancelablePromise<Array<CaaRecord>, Unlisted>
(hostname: string, rrtype: "MX"): CancelablePromise<Array<MxRecord>, Unlisted>
(hostname: string, rrtype: "NAPTR"): CancelablePromise<Array<NaptrRecord>, Unlisted>
(hostname: string, rrtype: "SOA"): CancelablePromise<SoaRecord, Unlisted>
(hostname: string, rrtype: "SRV"): CancelablePromise<Array<SrvRecord>, Unlisted>
(hostname: string, rrtype: "TXT"): CancelablePromise<Array<Array<string>>, Unlisted>
(hostname: string, rrtype: string): CancelablePromise<Array<AnyRecord> | Array<Array<string>> | Array<CaaRecord> | Array<MxRecord> | Array<NaptrRecord> | Array<SrvRecord> | Array<string> | SoaRecord, Unlisted>
```

## `resolve4` (const)

```text
(hostname: string): CancelablePromise<Array<string>, Unlisted>
(hostname: string, options: ResolveWithTtlOptions): CancelablePromise<Array<RecordWithTtl>, Unlisted>
(hostname: string, options: ResolveOptions): CancelablePromise<Array<RecordWithTtl> | Array<string>, Unlisted>
```

## `resolve6` (const)

```text
(hostname: string): CancelablePromise<Array<string>, Unlisted>
(hostname: string, options: ResolveWithTtlOptions): CancelablePromise<Array<RecordWithTtl>, Unlisted>
(hostname: string, options: ResolveOptions): CancelablePromise<Array<RecordWithTtl> | Array<string>, Unlisted>
```

## `resolveAny` (const)

```text
(hostname: string): CancelablePromise<Array<AnyRecord>, Unlisted>
```

## `resolveCaa` (const)

```text
(hostname: string): CancelablePromise<Array<CaaRecord>, Unlisted>
```

## `resolveCname` (const)

```text
(hostname: string): CancelablePromise<Array<string>, Unlisted>
```

## `resolveMx` (const)

```text
(hostname: string): CancelablePromise<Array<MxRecord>, Unlisted>
```

## `resolveNaptr` (const)

```text
(hostname: string): CancelablePromise<Array<NaptrRecord>, Unlisted>
```

## `resolveNs` (const)

```text
(hostname: string): CancelablePromise<Array<string>, Unlisted>
```

## `resolvePtr` (const)

```text
(hostname: string): CancelablePromise<Array<string>, Unlisted>
```

## `resolveSoa` (const)

```text
(hostname: string): CancelablePromise<SoaRecord, Unlisted>
```

## `resolveSrv` (const)

```text
(hostname: string): CancelablePromise<Array<SrvRecord>, Unlisted>
```

## `resolveTlsa` (const)

```text
(hostname: string): CancelablePromise<Array<ITlsaRecord>, Unlisted>
```

## `resolveTxt` (const)

```text
(hostname: string): CancelablePromise<Array<Array<string>>, Unlisted>
```

## `reverse` (const)

```text
(ip: string): CancelablePromise<Array<string>, Unlisted>
```

## `setDefaultResultOrder` (const)

```text
(order: "ipv4first" | "ipv6first" | "verbatim"): void
```

## `setServers` (const)

```text
(servers: ReadonlyArray<string>): void
```
