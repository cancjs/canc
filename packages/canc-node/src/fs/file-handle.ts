import { CancelablePromise } from '@cancjs/promise';

import manifest from '../../surface/fs.FileHandle.json';
import { adopted, IManifestEntry, passthrough, signalWrapped, TNodeFn } from './wrap';

/** A FileHandle member record, with the routing fields the decoration reads. */
interface IMemberEntry extends IManifestEntry {
  readonly kind: string;
  readonly wrapper: string;
  readonly cancelCategory: string | null;
}

/** Argument position node reads options from, for the members that do not take them first. */
const OPTIONS_INDEX: Record<string, number> = {
  appendFile: 1,
  writeFile: 1,
};

const members = manifest.exports as readonly IMemberEntry[];

let CancProto: object | undefined;

export function __resetCancProtoForTest() {
  CancProto = undefined;
}

export function decorate<T>(fh: T): T {
  const handle = fh as unknown as Record<string, unknown>;
  CancProto ??= buildProto(Object.getPrototypeOf(handle) as Record<string, unknown>);
  Object.setPrototypeOf(handle, CancProto);

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
  const overrides: Record<string, TNodeFn> = {};
  const skipped: string[] = [];

  for (const entry of members) {
    if (entry.kind !== 'fn') continue;
    const name = entry.name;
    const nativeFn = nativeProto[name];

    if (typeof nativeFn !== 'function') {
      skipped.push(name);
      continue;
    }

    overrides[name] = wrap(name, nativeFn as TNodeFn, entry);
  }

  if (skipped.length > 0) {
    console.warn(`[canc] fs.FileHandle missing members: ${skipped.join(', ')}`);
  }

  const newProto = Object.create(nativeProto) as Record<string, unknown>;
  for (const [name, fn] of Object.entries(overrides)) {
    Object.defineProperty(newProto, name, {
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
