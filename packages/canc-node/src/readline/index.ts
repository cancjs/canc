import type { Completer, Interface as NodeInterface, ReadLineOptions } from 'node:readline/promises';
import { createInterface as nodeCreateInterface } from 'node:readline/promises';

import questionManifest from '../../surface/readline.readlinePromises.Interface.json';
import { IManifestEntry, signalWrapped, TCancelable, TNodeFn } from '../fs/wrap';

export type { Completer, ReadLineOptions } from 'node:readline/promises';
export { Readline } from 'node:readline/promises';

const questionEntry = (questionManifest.exports as readonly IManifestEntry[]).find(
  (entry) => entry.name === 'question',
);

/** `question` reads its options from the second argument. */
const QUESTION_OPTIONS_INDEX = 1;

/**
 * `readlinePromises.Interface`, with `question` answering a cancelable promise instead of a plain
 * one. `createInterface()` is the only sanctioned way to obtain one, matching node's own docs; this
 * type exists for annotating what it hands back.
 */
export interface Interface extends Omit<NodeInterface, 'question'> {
  question: TCancelable<NodeInterface['question']>;
}

let CancProto: object | undefined;

/**
 * Build the prototype every decorated interface shares, wrapping only `question`.
 *
 * `createInterface()` always hands back an instance of node's own `Interface`, so its prototype is
 * the same object on every call; building the override chain once and reusing it is what keeps
 * decoration to one allocation instead of one per interface.
 */
function buildProto(nativeProto: Record<string, unknown>): object {
  const nativeQuestion = nativeProto.question as TNodeFn;
  const proto = Object.create(nativeProto) as Record<string, unknown>;

  Object.defineProperty(proto, 'question', {
    value: signalWrapped(nativeQuestion, questionEntry, QUESTION_OPTIONS_INDEX),
    writable: true,
    configurable: true,
    enumerable: false,
  });

  return proto;
}

function decorate(rl: NodeInterface): Interface {
  const handle = rl as unknown as Record<string, unknown>;
  CancProto ??= buildProto(Object.getPrototypeOf(handle) as Record<string, unknown>);
  Object.setPrototypeOf(handle, CancProto);
  return rl as unknown as Interface;
}

/**
 * `readlinePromises.createInterface`, with the returned interface's `question` answering a
 * cancelable promise.
 *
 * A canceled question forwards node's own `signal` handling: node aborts the pending question and
 * restores the interface to the state `question` found it in, same as it does for a caller's own
 * signal. There is nothing left for a teardown to do, which is why this wrapper does not have one.
 *
 * `[Symbol.dispose]` on the result is the documented cleanup from v23.10.0, backported to the 22 LTS
 * line at v22.15.0. Below that line, call `close()` directly.
 */
export function createInterface(
  input: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
  completer?: Completer,
  terminal?: boolean,
): Interface;
export function createInterface(options: ReadLineOptions): Interface;
export function createInterface(...args: unknown[]): Interface {
  const rl = (nodeCreateInterface as TNodeFn)(...args) as NodeInterface;
  return decorate(rl);
}
