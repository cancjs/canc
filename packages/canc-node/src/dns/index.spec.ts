import dgram from 'node:dgram';
import type { MxRecord, RecordWithTtl } from 'node:dns';
import nodeDnsPromises from 'node:dns/promises';

import { CancelablePromise, isCancelError } from '@cancjs/promise';

import { isNotImplementedError } from '../errors/classes';
import { features } from '../features';
import * as dnsExports from './index';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Never invoked: the point is that tsc resolves each overload at the exact call shape below, so a
// wrapper accidentally widened to `unknown` or `any` fails compilation here rather than at a
// consumer's call site.
function typeAssertions(): unknown[] {
  const resolve4Plain = dnsExports.resolve4('x');
  const resolve4Ttl = dnsExports.resolve4('x', { ttl: true });
  const resolveMxRecords = dnsExports.resolveMx('x');

  type _Assertions = [
    Expect<Equal<typeof resolve4Plain, CancelablePromise<string[]>>>,
    Expect<Equal<typeof resolve4Ttl, CancelablePromise<RecordWithTtl[]>>>,
    Expect<Equal<typeof resolveMxRecords, CancelablePromise<MxRecord[]>>>,
  ];

  return [resolve4Plain, resolve4Ttl, resolveMxRecords];
}

const ALL_CONSTANT_NAMES = [
  'NODATA',
  'FORMERR',
  'SERVFAIL',
  'NOTFOUND',
  'NOTIMP',
  'REFUSED',
  'BADQUERY',
  'BADNAME',
  'BADFAMILY',
  'BADRESP',
  'CONNREFUSED',
  'TIMEOUT',
  'EOF',
  'FILE',
  'NOMEM',
  'DESTRUCTION',
  'BADSTR',
  'BADFLAGS',
  'NONAME',
  'BADHINTS',
  'NOTINITIALIZED',
  'LOADIPHLPAPI',
  'ADDRGETNETWORKPARAMS',
  'CANCELLED',
] as const;

/** The question section of a parsed query, and the exact bytes to echo back in a reply. */
interface IParsedQuestion {
  readonly id: number;
  readonly name: string;
  readonly qtype: number;
  readonly questionBytes: Buffer;
}

function parseQuestion(query: Buffer): IParsedQuestion {
  const id = query.readUInt16BE(0);
  let offset = 12;
  const labels: string[] = [];
  while (query[offset] !== 0) {
    const len = query[offset];
    offset += 1;
    labels.push(query.toString('ascii', offset, offset + len));
    offset += len;
  }
  offset += 1; // null terminator
  const questionEnd = offset + 4; // qtype(2) + qclass(2), ignore anything (EDNS OPT) after it
  return {
    id,
    name: labels.join('.'),
    qtype: query.readUInt16BE(offset),
    questionBytes: query.subarray(12, questionEnd),
  };
}

function aRecordAnswer(ip: string, ttl = 60): Buffer {
  const name = Buffer.from([0xc0, 0x0c]); // pointer to the question name at byte offset 12
  const meta = Buffer.alloc(10);
  meta.writeUInt16BE(1, 0); // TYPE A
  meta.writeUInt16BE(1, 2); // CLASS IN
  meta.writeUInt32BE(ttl, 4);
  meta.writeUInt16BE(4, 8); // RDLENGTH
  const rdata = Buffer.from(ip.split('.').map(Number));
  return Buffer.concat([name, meta, rdata]);
}

/** A minimal, valid DNS response: header plus the query's own question section, echoed back. */
function buildResponse(query: Buffer, answers: Buffer[]): Buffer {
  const { id, questionBytes } = parseQuestion(query);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x8180, 2); // response, no error, recursion desired+available
  header.writeUInt16BE(1, 4); // QDCOUNT
  header.writeUInt16BE(answers.length, 6); // ANCOUNT
  return Buffer.concat([header, questionBytes, ...answers]);
}

interface IFakeDnsServer {
  readonly port: number;
  readonly receivedCount: () => number;
  readonly close: () => Promise<void>;
}

/**
 * A local UDP DNS responder, so the module-level exports can be tested against a real round trip
 * without reaching a public DNS name.
 *
 * @param onQuery - Called with the raw query and a function that sends a raw reply. Calling `reply`
 * asynchronously (or not at all) is what lets a test observe cancel racing the answer.
 */
function startFakeDnsServer(onQuery: (query: Buffer, reply: (data: Buffer) => void) => void): Promise<IFakeDnsServer> {
  return new Promise((resolveReady) => {
    const socket = dgram.createSocket('udp4');
    let received = 0;

    socket.on('message', (msg, rinfo) => {
      received += 1;
      onQuery(msg, (data) => socket.send(data, rinfo.port, rinfo.address));
    });

    socket.bind(0, '127.0.0.1', () => {
      const address = socket.address();
      resolveReady({
        port: typeof address === 'string' ? 0 : address.port,
        receivedCount: () => received,
        close: () => new Promise<void>((resolveClosed) => socket.close(() => resolveClosed())),
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('@cancjs/node/dns module-level exports', () => {
  let originalServers: string[];

  beforeAll(() => {
    originalServers = dnsExports.getServers();
  });

  afterEach(() => {
    dnsExports.setServers(originalServers);
  });

  it('resolve4 reaches the server set via setServers and returns typed string[]', async () => {
    const server = await startFakeDnsServer((query, reply) => reply(buildResponse(query, [aRecordAnswer('1.2.3.4')])));
    try {
      dnsExports.setServers([`127.0.0.1:${server.port}`]);

      const addresses: string[] = await dnsExports.resolve4('example.test');

      expect(addresses).toEqual(['1.2.3.4']);
      expect(server.receivedCount()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('canceling resolve4 rejects CancelError while the query keeps running to completion', async () => {
    let deliveredAt = -1;
    const server = await startFakeDnsServer((query, reply) => {
      setTimeout(() => {
        deliveredAt = Date.now();
        reply(buildResponse(query, [aRecordAnswer('5.6.7.8')]));
      }, 80);
    });

    try {
      dnsExports.setServers([`127.0.0.1:${server.port}`]);

      const canceledAt = Date.now();
      const p = dnsExports.resolve4('example.test');
      p.cancel('stop');

      let caught: unknown;
      try {
        await p;
      } catch (err) {
        caught = err;
      }
      expect(isCancelError(caught)).toBe(true);

      // give the delayed answer time to actually land, proving the query was not aborted
      await sleep(200);
      expect(server.receivedCount()).toBe(1);
      expect(deliveredAt).toBeGreaterThan(canceledAt);
    } finally {
      await server.close();
    }
  });

  it('setServers then resolve4 reaches the injected server, not the system resolver', async () => {
    const server = await startFakeDnsServer((query, reply) => reply(buildResponse(query, [aRecordAnswer('9.9.9.9')])));
    try {
      dnsExports.setServers([`127.0.0.1:${server.port}`]);

      await dnsExports.resolve4('another.example.test');

      // a Resolver-per-call implementation would never reach this fake server at all
      expect(server.receivedCount()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('resolveTlsa is gated on node 22+, throws NotImplementedError naming the version below that', async () => {
    if (features.nodeMajor < 22) {
      let error: unknown;
      try {
        dnsExports.resolveTlsa('example.test');
      } catch (err) {
        error = err;
      }
      expect(isNotImplementedError(error)).toBe(true);
      expect((error as { required?: string }).required).toBe('22');
      return;
    }

    const server = await startFakeDnsServer((query, reply) => reply(buildResponse(query, [])));
    try {
      dnsExports.setServers([`127.0.0.1:${server.port}`]);

      expect(typeof dnsExports.resolveTlsa).toBe('function');
      const p = dnsExports.resolveTlsa('example.test');
      expect(p).toBeInstanceOf(CancelablePromise);
      p.cancel();
      await expect(p).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it('exports all 24 error-code constants, matching node values', () => {
    expect(ALL_CONSTANT_NAMES.length).toBe(24);
    for (const name of ALL_CONSTANT_NAMES) {
      expect((dnsExports as unknown as Record<string, unknown>)[name]).toBe(
        (nodeDnsPromises as unknown as Record<string, unknown>)[name],
      );
    }
  });

  it('type fixture: resolve4/resolveMx return exactly the cancelable types the overloads promise', () => {
    // never called; its existence as a function value is enough to keep it from being flagged
    // unused while tsc still checks its body
    expect(typeof typeAssertions).toBe('function');
  });
});
