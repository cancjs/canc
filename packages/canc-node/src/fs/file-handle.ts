import type * as nodeFsPromises from 'node:fs/promises';

import { CancelablePromise } from '@cancjs/promise';

import manifest from '../../surface/fs.FileHandle.json';
import { features } from '../features';
import { adopted, IManifestEntry, passthrough, signalWrapped, TCancelableFileHandle, TNodeFn } from './wrap';

export type { TCancelableFileHandle };

/** A FileHandle member record, with the routing fields the decoration reads. */
interface IMemberEntry extends IManifestEntry {
  readonly kind: string;
  readonly wrapper: string;
  readonly cancelCategory: string | null;
  readonly minMajor?: number;
  readonly gate?: string | null;
  readonly callPath?: string;
}

/** Argument position node reads options from, for the members that do not take them first. */
const OPTIONS_INDEX: Record<string, number> = {
  appendFile: 1,
  writeFile: 1,
};

const members = manifest.exports as readonly IMemberEntry[];

let protoCache = new WeakMap<object, object>();
let cancProtos = new WeakSet<object>();

export function __resetCancProtoForTest() {
  protoCache = new WeakMap();
  cancProtos = new WeakSet();
}

export function decorate<T extends nodeFsPromises.FileHandle = nodeFsPromises.FileHandle>(
  fh: T,
): TCancelableFileHandle<T>;
export function decorate<T>(fh: T): TCancelableFileHandle;
export function decorate(fh: unknown): unknown {
  const handle = fh as Record<string, unknown>;
  const nativeProto = Object.getPrototypeOf(handle) as Record<string, unknown> | null;

  if (nativeProto && typeof nativeProto === 'object' && !cancProtos.has(nativeProto)) {
    let cancProto = protoCache.get(nativeProto);
    if (!cancProto) {
      cancProto = buildProto(nativeProto);
      protoCache.set(nativeProto, cancProto);
      cancProtos.add(cancProto);
    }
    Object.setPrototypeOf(handle, cancProto);
  }

  const ourMembers = new Set(members.map((entry) => entry.name));
  for (const name of Object.getOwnPropertyNames(handle)) {
    if (!ourMembers.has(name)) continue;
    const own = Object.getOwnPropertyDescriptor(handle, name);
    if (!own || typeof own.value !== 'function') continue;

    Object.defineProperty(handle, name, {
      ...own,
      value: wrap(name, own.value as TNodeFn),
      configurable: true,
    });
  }
  return fh;
}

function buildProto(nativeProto: Record<string, unknown>) {
  const overrides = new Map<PropertyKey, TNodeFn>();
  const skipped: string[] = [];

  for (const entry of members) {
    if (entry.kind !== 'fn' || entry.callPath === 'sync') continue;
    if (entry.name === 'close') continue;

    const isAsyncDispose = entry.name === '[Symbol.asyncDispose]';
    const asyncDisposeSymbol = (Symbol as { asyncDispose?: symbol }).asyncDispose;
    const key: PropertyKey = isAsyncDispose && asyncDisposeSymbol ? asyncDisposeSymbol : entry.name;

    const nativeFn = (nativeProto as Record<PropertyKey, unknown>)[key];

    if (typeof nativeFn !== 'function') {
      const minMajor = entry.minMajor ?? 18;
      if (minMajor <= features.nodeMajor && entry.gate === null) {
        skipped.push(entry.name);
      }
      continue;
    }

    overrides.set(key, wrap(entry.name, nativeFn as TNodeFn, entry));
  }

  if (skipped.length > 0) {
    console.warn(`[canc] fs.FileHandle missing members: ${skipped.join(', ')}`);
  }

  const newProto = Object.create(nativeProto) as Record<string, unknown>;
  for (const [key, fn] of overrides) {
    Object.defineProperty(newProto, key, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  return newProto;
}

function wrap(name: string, nativeFn: TNodeFn, known?: IMemberEntry): TNodeFn {
  const entry = known ?? members.find((member) => member.name === name);

  if (name === 'close') {
    // close IS the teardown, so it is shielded: a canceled close would leave the descriptor open
    return function closeShielded(this: unknown, ...args: unknown[]) {
      return new CancelablePromise(
        (resolve) => {
          resolve(nativeFn.apply(this, args) as PromiseLike<unknown>);
        },
        { shield: true },
      );
    };
  }

  const optionsIndex = OPTIONS_INDEX[name] ?? 0;

  // a gated member only gets here when the capture scan found it, so the runtime has the member and
  // only its signal support varies by release line
  switch (entry?.wrapper) {
    case 'cancelify-signal':
    case 'gated':
      return signalWrapped(nativeFn, entry, optionsIndex);
    case 'passthrough':
      return passthrough(nativeFn);
    case 'promisify-custom':
      return adopted(nativeFn);
    default:
      return entry?.cancelCategory === 'D' ? adopted(nativeFn) : nativeFn;
  }
}
