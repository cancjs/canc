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
import { decorate } from '../../../packages/canc-node/src/fs/file-handle';
import * as sync from '../../../packages/canc-node/src/fs/sync';
import { TNodeSignatures } from '../../../packages/canc-node/src/fs/wrap';
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

  type A12 = Expect<Equal<typeof opened, CancelablePromise<fs.TCancelableFileHandle>>>;
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

export async function fileHandleAssertions(path: string, nativeHandle: nodeFsp.FileHandle) {
  const fh = await fs.open(path);
  fh.readFile().cancel();

  const decorated = decorate(nativeHandle);
  decorated.readFile().cancel();

  const rs = fh.createReadStream();
  // property access is the assertion, it fails to compile if the stream has no pipe
  void rs.pipe;

  type H1 = Expect<
    Equal<
      ReturnType<fs.TCancelableFileHandle['readableWebStream']>,
      ReturnType<nodeFsp.FileHandle['readableWebStream']>
    >
  >;
  type H2 = Expect<
    Equal<ReturnType<fs.TCancelableFileHandle['createReadStream']>, ReturnType<nodeFsp.FileHandle['createReadStream']>>
  >;
  type H3 = Expect<Equal<typeof fh, fs.TCancelableFileHandle>>;
  type H4 = Expect<Equal<typeof decorated, fs.TCancelableFileHandle>>;

  return [fh, rs, decorated] as const;
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

/**
 * A synthetic function type with exactly six overloads, one for every rung `TNodeSignatures`
 * (`fs/wrap.ts`) offers today. Each rung takes a distinct literal argument and returns a distinct
 * literal type, so a collapse is visible immediately: a merged rung makes one of the six calls
 * below type-check against the wrong return, or stop type-checking at all.
 *
 * This interface is also the rehearsal fixture for the arity cap: temporarily adding a seventh
 * signature here reproduces, on a controlled type, exactly what happens when a real node export
 * grows past the cap (see `ladderDropsTheOldestOverloadPastItsCap` below for that failure pinned
 * on purpose). Restore it to six afterward; the six-overload shape is the committed, passing state.
 */
interface ISixOverloads {
  (tag: 1): 'one';
  (tag: 2): 'two';
  (tag: 3): 'three';
  (tag: 4): 'four';
  (tag: 5): 'five';
  (tag: 6): 'six';
}

declare const sixWrapped: TNodeSignatures<ISixOverloads, 'same'>;

/**
 * The ladder still covers a function sitting exactly at its own cap: all six rungs of the
 * synthetic six-overload type above stay distinct through `TNodeSignatures`, matching node's own
 * `readdir` (`overloadsSurvive` above), the widest real member this package wraps at five
 * overloads. Growing `ISixOverloads` to seven makes `v1` (rung one) fail to type-check, because a
 * seventh signature pushes the oldest rung out of the reconstructed type; that is the arity cap
 * firing on a controlled type instead of on `readdir` after node ships a change.
 */
export function ladderCoversItsOwnCap() {
  const v1 = sixWrapped(1);
  const v2 = sixWrapped(2);
  const v3 = sixWrapped(3);
  const v4 = sixWrapped(4);
  const v5 = sixWrapped(5);
  const v6 = sixWrapped(6);

  type C1 = Expect<Equal<typeof v1, 'one'>>;
  type C2 = Expect<Equal<typeof v2, 'two'>>;
  type C3 = Expect<Equal<typeof v3, 'three'>>;
  type C4 = Expect<Equal<typeof v4, 'four'>>;
  type C5 = Expect<Equal<typeof v5, 'five'>>;
  type C6 = Expect<Equal<typeof v6, 'six'>>;

  return [v1, v2, v3, v4, v5, v6] as const;
}

/** A seven-overload counterpart to {@link ISixOverloads}, one rung past the ladder's cap. */
interface ISevenOverloads {
  (tag: 1): 'one';
  (tag: 2): 'two';
  (tag: 3): 'three';
  (tag: 4): 'four';
  (tag: 5): 'five';
  (tag: 6): 'six';
  (tag: 7): 'seven';
}

declare const sevenWrapped: TNodeSignatures<ISevenOverloads, 'same'>;

/**
 * Pins today's actual overflow behavior on a synthetic type, so it is proven rather than assumed.
 * A seventh overload does not collapse the whole signature to one rung: TS keeps the newest six
 * and silently drops the OLDEST, so rung one (`tag: 1`, declared first) is the one that stops
 * type-checking, while rungs two through seven all still resolve their own distinct return types.
 * That is the concrete shape of the bug this task guards: a function's original, presumably most
 * common, call form is the one that breaks once a later overload pushes it past the cap.
 *
 * The `@ts-expect-error` on rung one is load-bearing. If the ladder ever stops dropping it, the
 * directive goes unused and `tsc` reports that as an error, the same signal this task wants
 * produced for a real node export instead of a silent behavior change.
 */
export function ladderDropsTheOldestOverloadPastItsCap() {
  // @ts-expect-error rung one, declared first, is the one the cap drops once a seventh exists
  const droppedRung = sevenWrapped(1);

  const rung2 = sevenWrapped(2);
  const rung3 = sevenWrapped(3);
  const rung4 = sevenWrapped(4);
  const rung5 = sevenWrapped(5);
  const rung6 = sevenWrapped(6);
  const rung7 = sevenWrapped(7);

  type C1 = Expect<Equal<typeof rung2, 'two'>>;
  type C2 = Expect<Equal<typeof rung3, 'three'>>;
  type C3 = Expect<Equal<typeof rung4, 'four'>>;
  type C4 = Expect<Equal<typeof rung5, 'five'>>;
  type C5 = Expect<Equal<typeof rung6, 'six'>>;
  type C6 = Expect<Equal<typeof rung7, 'seven'>>;

  return [droppedRung, rung2, rung3, rung4, rung5, rung6, rung7] as const;
}

/**
 * Ties the cap to the widest real export this package wraps, not only to a synthetic type.
 * `readdir` carries five overloads today (`overloadsSurvive` above exercises all three of its
 * return-type buckets); the moment `@types/node` gives it a sixth or seventh, one of those three
 * calls stops resolving `readdir`'s own answer and this file fails to compile, before anyone finds
 * out at runtime that `fs.readdir` quietly started returning the wrong shape.
 */
export function ladderStillCoversTheWidestRealMember(path: string) {
  const names = fs.readdir(path);
  const buffers = fs.readdir(path, 'buffer');
  const dirents = fs.readdir(path, { withFileTypes: true });

  const nodeBuffers = nodeFsp.readdir(path, 'buffer');

  type R1 = Expect<Equal<typeof names, CancelablePromise<string[]>>>;
  type R2 = Expect<SameAsNode<typeof buffers, typeof nodeBuffers>>;
  type R3 = Expect<Equal<ResolvedBy<typeof dirents>, nodeFs.Dirent[]>>;

  return [names, buffers, dirents] as const;
}
