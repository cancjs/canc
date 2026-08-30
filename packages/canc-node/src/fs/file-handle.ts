import { CancelablePromise } from '@cancjs/promise';

import { cancelify, gatedWrapped, signalWrapped, teardownWrapped } from './wrap';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('../../surface/fs.FileHandle.json');

let CancProto: object | undefined;

export function __resetCancProtoForTest() {
  CancProto = undefined;
}

export function decorate(fh: any) {
  CancProto ??= buildProto(Object.getPrototypeOf(fh));
  Object.setPrototypeOf(fh, CancProto!);

  const ourMembers = new Set(manifest.exports.map((e: any) => e.name));
  for (const name of Object.getOwnPropertyNames(fh)) {
    if (!ourMembers.has(name)) continue;
    const own = Object.getOwnPropertyDescriptor(fh, name);
    if (!own || typeof own.value !== 'function') continue;

    Object.defineProperty(fh, name, {
      ...own,
      value: wrap(name, own.value),
      configurable: true,
    });
  }
  return fh;
}

function buildProto(nativeProto: any) {
  const overrides: any = {};
  const skipped: string[] = [];

  for (const entry of manifest.exports) {
    if (entry.kind !== 'fn') continue;
    const name = entry.name;
    const nativeFn = nativeProto[name];

    if (typeof nativeFn !== 'function') {
      skipped.push(name);
      continue;
    }

    overrides[name] = wrap(name, nativeFn, entry);
  }

  if (skipped.length > 0) {
    console.warn(`[canc] fs.FileHandle missing members: ${skipped.join(', ')}`);
  }

  const newProto = Object.create(nativeProto);
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

function wrap(name: string, nativeFn: (...args: any[]) => any, entry?: any) {
  entry ??= manifest.exports.find((e: any) => e.name === name);

  if (name === 'close') {
    return function (this: any, ...args: any[]) {
      const p = nativeFn.apply(this, args);
      return new CancelablePromise(
        (resolve, reject) => {
          Promise.resolve(p).then(resolve, reject);
        },
        { shield: true },
      );
    };
  }

  const bound = function (this: any, ...args: any[]) {
    return nativeFn.apply(this, args);
  };

  switch (entry.wrapper) {
    case 'cancelify-signal':
      return function (this: any, ...args: any[]) {
        return signalWrapped(bound.bind(this), entry)(...args);
      };
    case 'cancelify-teardown':
      return function (this: any, ...args: any[]) {
        return teardownWrapped(bound.bind(this), (val) => {
          if (val && typeof val.close === 'function') val.close();
          else if (val && typeof val.destroy === 'function') val.destroy();
        })(...args);
      };
    case 'gated':
      return function (this: any, ...args: any[]) {
        const isAvail = !!entry.nodeSignal?.sinceByMajor?.[parseInt(process.versions.node.split('.')[0], 10)];
        return gatedWrapped(
          isAvail,
          name,
          entry.nodeSignal?.since || 'unknown',
          signalWrapped(bound.bind(this), entry),
        )(...args);
      };
    case 'promisify-custom':
      return function (this: any, ...args: any[]) {
        return cancelify((_ctx, ...a) => bound.apply(this, a))(...args);
      };
    case 'passthrough':
    default:
      if (entry.cancelCategory === 'D' && name !== 'close') {
        return function (this: any, ...args: any[]) {
          return cancelify((_ctx, ...a) => bound.apply(this, a))(...args);
        };
      }
      return bound;
  }
}
