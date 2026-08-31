/**
 * Type-level assertions for `@cancjs/node/fs` and `@cancjs/node/fs/sync`.
 *
 * The surface is a drop-in for `node:fs/promises`, so the contract under test is narrow: for every
 * call, the resolved value is the one node resolves, and the promise carrying it is cancelable.
 * Most assertions are therefore written against node's own answer for the same call rather than
 * against a spelled-out type, so a rename inside `@types/node` cannot turn a green suite red.
 *
 * The negative assertions matter as much as the positive ones. A wrapper built on a variadic
 * combinator publishes `(...args: unknown[]) => CancelablePromise<unknown>` without any of that
 * appearing at the export line, so a text search over the source cannot see it. The assertions can.
 *
 * Runtime-dead: nothing in here executes. The calls exist to make the compiler resolve overloads.
 */
import CancelablePromise from '@cancjs/promise';
import * as nodeFs from 'node:fs';
import * as nodeFsp from 'node:fs/promises';

import * as fs from '../../../packages/canc-node/src/fs';
import * as sync from '../../../packages/canc-node/src/fs/sync';
import { Equal, Expect, IsAny, IsUnknown, Not } from '../common/assert-type';

// Our answer for a call, against node's answer for the same call, with cancelability added.
type SameAsNode<TOurs, TNode> = Equal<TOurs, TNode extends Promise<infer TValue> ? CancelablePromise<TValue> : never>;

type ResolvedBy<T> = T extends PromiseLike<infer TValue> ? TValue : never;

export function overloadsSurvive(path: string, handle: nodeFsp.FileHandle) {
  // three overloads: encoding shorthand, options bag, and neither
  const asText = fs.readFile(path, 'utf8');
  const asTextViaOptions = fs.readFile(path, { encoding: 'utf8' });
  const asBuffer = fs.readFile(path);
  const asBufferViaOptions = fs.readFile(path, { encoding: null });

  type A1 = Expect<Equal<typeof asText, CancelablePromise<string>>>;
  type A2 = Expect<Equal<typeof asTextViaOptions, CancelablePromise<string>>>;
  // node renames its own buffer type between major typings, so the claim is made against the
  // answer node gives for the same call rather than against a spelled-out name
  const nodeBuffer = nodeFsp.readFile(path);
  const nodeBufferViaOptions = nodeFsp.readFile(path, { encoding: null });

  type A3 = Expect<SameAsNode<typeof asBuffer, typeof nodeBuffer>>;
  type A4 = Expect<SameAsNode<typeof asBufferViaOptions, typeof nodeBufferViaOptions>>;

  // the widest member on the surface, five overloads
  const names = fs.readdir(path);
  const buffers = fs.readdir(path, 'buffer');
  const dirents = fs.readdir(path, { withFileTypes: true });

  const nodeBuffers = nodeFsp.readdir(path, 'buffer');

  type A5 = Expect<Equal<typeof names, CancelablePromise<string[]>>>;
  type A6 = Expect<SameAsNode<typeof buffers, typeof nodeBuffers>>;
  type A7 = Expect<Equal<ResolvedBy<typeof dirents>, nodeFs.Dirent[]>>;

  // the options argument sits third here, and the second overload is selected by `bigint`
  const written = fs.writeFile(path, 'text');
  const writtenWithOptions = fs.writeFile(path, Buffer.from('x'), { encoding: 'utf8', flag: 'a' });
  const stats = fs.stat(path);
  const bigStats = fs.stat(path, { bigint: true });

  type A8 = Expect<Equal<typeof written, CancelablePromise<void>>>;
  type A9 = Expect<Equal<typeof writtenWithOptions, CancelablePromise<void>>>;
  type A10 = Expect<Equal<typeof stats, CancelablePromise<nodeFs.Stats>>>;
  type A11 = Expect<Equal<typeof bigStats, CancelablePromise<nodeFs.BigIntStats>>>;

  // a handle, a boolean and a void call, none of them promise-shaped in the same way
  const opened = fs.open(path, 'r');
  const found = fs.exists(path);
  const reachable = fs.access(path);

  type A12 = Expect<SameAsNode<typeof opened, ReturnType<typeof nodeFsp.open>>>;
  type A13 = Expect<Equal<typeof found, CancelablePromise<boolean>>>;
  type A14 = Expect<Equal<typeof reachable, CancelablePromise<void>>>;

  return [
    asText,
    asTextViaOptions,
    asBuffer,
    asBufferViaOptions,
    names,
    buffers,
    dirents,
    written,
    writtenWithOptions,
    stats,
    bigStats,
    opened,
    found,
    reachable,
    handle,
  ] as const;
}

export function wrongArgumentsAreRejected(path: string) {
  // @ts-expect-error a number is not a path
  fs.writeFile(123);
  // @ts-expect-error writeFile needs the data to write
  fs.writeFile(path);
  // @ts-expect-error `withFileTypes` is not an encoding
  fs.readFile(path, { encoding: 'withFileTypes' });
  // @ts-expect-error statSync takes a path, not a descriptor object
  sync.statSync({ fd: 1 });
}

/**
 * Nothing on the surface may publish an erased type.
 *
 * These fail on a variadic wrapper and pass on a derived one, which is the whole point: the
 * erasure lives in the combinator's return type and is invisible to a reader of the export line.
 */
export function nothingIsErased(path: string) {
  type N1 = Expect<Not<Equal<Parameters<typeof fs.readFile>, unknown[]>>>;
  type N2 = Expect<Not<Equal<Parameters<typeof fs.writeFile>, unknown[]>>>;
  type N3 = Expect<Not<Equal<Parameters<typeof fs.stat>, unknown[]>>>;
  type N4 = Expect<Not<IsUnknown<ResolvedBy<ReturnType<typeof fs.readFile>>>>>;
  type N5 = Expect<Not<IsUnknown<ResolvedBy<ReturnType<typeof fs.stat>>>>>;
  type N6 = Expect<Not<IsAny<ReturnType<typeof sync.readdirSync>>>>;
  type N7 = Expect<Not<IsAny<ReturnType<typeof sync.statSync>>>>;
  type N8 = Expect<Not<IsAny<Parameters<typeof sync.readFileSync>>>>;

  return path;
}

/** The synchronous subpath is not cancelable, so its type is node's own, unchanged. */
export function syncKeepsNodesTypes(path: string) {
  const stats = sync.statSync(path);
  const bigStats = sync.statSync(path, { bigint: true });
  const names = sync.readdirSync(path);
  const dirents = sync.readdirSync(path, { withFileTypes: true });
  const text = sync.readFileSync(path, 'utf8');

  type S1 = Expect<Equal<typeof stats, nodeFs.Stats>>;
  type S2 = Expect<Equal<typeof bigStats, nodeFs.BigIntStats>>;
  type S3 = Expect<Equal<typeof names, string[]>>;
  type S4 = Expect<Equal<typeof dirents, nodeFs.Dirent[]>>;
  type S5 = Expect<Equal<typeof text, string>>;
  type S6 = Expect<Equal<typeof sync.accessSync, typeof nodeFs.accessSync>>;
  type S7 = Expect<Equal<typeof sync.copyFileSync, typeof nodeFs.copyFileSync>>;
  type S8 = Expect<Equal<typeof sync.mkdirSync, typeof nodeFs.mkdirSync>>;

  return [stats, bigStats, names, dirents, text] as const;
}

/** A cancelable promise is still a promise, so every binding stays usable as node's own. */
export function stillDropsIn(path: string) {
  const asNode: Promise<string> = fs.readFile(path, 'utf8');
  const cancelable: CancelablePromise<string> = fs.readFile(path, 'utf8');
  cancelable.cancel();

  return [asNode, cancelable] as const;
}
