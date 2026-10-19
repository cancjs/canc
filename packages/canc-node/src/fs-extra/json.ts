import { dirname, resolve as resolvePath } from 'node:path';

import { JsonParseError } from '@cancjs/node';
import { lstat, readFile, readlink, realpath, writeFile } from '@cancjs/node/fs';
import { mkdirSync, readFileSync, writeFileSync } from '@cancjs/node/fs/sync';
import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';
import { ensureDir } from './ensure';
import { replaceFile } from './replace-file';

export interface IReadJsonOptions {
  encoding?: BufferEncoding | null;
  flag?: string;
  throws?: boolean;
  reviver?: (this: unknown, key: string, value: unknown) => unknown;
}

export interface IWriteJsonOptions {
  encoding?: BufferEncoding | null;
  flag?: string;
  mode?: number | string;
  spaces?: number | string | null;
  EOL?: string;
  replacer?: ((this: unknown, key: string, value: unknown) => unknown) | (number | string)[] | null;
}

export type IOutputJsonOptions = IWriteJsonOptions;

function stripBom(content: string): string {
  if (typeof content === 'string' && content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function toUtf8String(content: string | Buffer, encoding?: BufferEncoding | null): string {
  if (typeof content === 'string') {
    return stripBom(content);
  }
  if (Buffer.isBuffer(content)) {
    if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
      return content.subarray(3).toString(encoding! || 'utf8');
    }
    return stripBom(content.toString(encoding! || 'utf8'));
  }
  return stripBom(String(content));
}

function formatJson(object: unknown, options?: IWriteJsonOptions | BufferEncoding | null): string {
  const opts = typeof options === 'string' ? { encoding: options } : (options ?? {});
  const replacer = opts.replacer ?? undefined;
  const spaces = opts.spaces ?? undefined;
  const EOL = opts.EOL ?? '\n';

  const str = JSON.stringify(object, replacer as any, spaces);
  const body = str === undefined ? '' : str;
  if (EOL === '\n') {
    return body + '\n';
  }
  return body.replace(/\n/g, EOL) + EOL;
}

export function readJson<T = any>(
  file: string,
  options: IReadJsonOptions & { throws: false },
): CancelablePromise<T | null, Unlisted>;
export function readJson<T = any>(
  file: string,
  options?: IReadJsonOptions | BufferEncoding | null,
): CancelablePromise<T, Unlisted>;
export function readJson<T = any>(
  file: string,
  options?: IReadJsonOptions | BufferEncoding | null,
): CancelablePromise<T | null, Unlisted> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    const opts = typeof options === 'string' ? { encoding: options } : (options ?? {});
    const encoding = opts.encoding === undefined ? 'utf8' : opts.encoding;
    const shouldThrow = opts.throws !== false;
    const reviver = opts.reviver;

    const p = readFile(file, { encoding, flag: opts.flag });
    handleCancel((reason) => {
      p.cancel(reason);
    });

    resolve(
      p.then((content) => {
        const str = toUtf8String(content, encoding);
        try {
          return JSON.parse(str, reviver) as T;
        } catch (err) {
          if (!shouldThrow) {
            return null;
          }
          throw new JsonParseError(String(file) + ': ' + (err as Error).message, { path: file, cause: err });
        }
      }),
    );
  });
}

export function readJsonSync<T = any>(file: string, options: IReadJsonOptions & { throws: false }): T | null;
export function readJsonSync<T = any>(file: string, options?: IReadJsonOptions | BufferEncoding | null): T;
export function readJsonSync<T = any>(file: string, options?: IReadJsonOptions | BufferEncoding | null): T | null {
  const opts = typeof options === 'string' ? { encoding: options } : (options ?? {});
  const encoding = opts.encoding === undefined ? 'utf8' : opts.encoding;
  const shouldThrow = opts.throws !== false;
  const reviver = opts.reviver;

  const content = readFileSync(file, { encoding, flag: opts.flag });

  const str = toUtf8String(content, encoding);
  try {
    return JSON.parse(str, reviver) as T;
  } catch (err) {
    if (!shouldThrow) {
      return null;
    }
    throw new JsonParseError(String(file) + ': ' + (err as Error).message, { path: file, cause: err });
  }
}

type TWriteOptions = Parameters<typeof writeFile>[2];

const MAX_LINK_HOPS = 40;

// realpath rejects dangling links: follow readlink by hand, keep a plain missing path as given
function resolveWriteTarget(
  file: string,
  hops: number,
  track: (pending: CancelablePromise<unknown, unknown>) => void,
): CancelablePromise<string, unknown> {
  return new CancelablePromise<string, unknown>((resolve) => {
    const real = realpath(file);
    track(real);
    resolve(
      real.then(
        (resolved) => resolved as string,
        () => {
          const stat = lstat(file);
          track(stat);
          return stat.then(
            (info) => {
              if (!info.isSymbolicLink()) return file;
              if (hops === 0) throw Object.assign(new Error(`too many symbolic links: ${file}`), { code: 'ELOOP' });
              const link = readlink(file);
              track(link);
              return link.then((target) =>
                resolveWriteTarget(resolvePath(dirname(file), String(target)), hops - 1, track),
              );
            },
            () => file,
          );
        },
      ),
    );
  });
}

// replaceFile cannot honor append or exclusive flags, so those keep the direct write
function writeJsonContent(file: string, content: string, options: TWriteOptions & { flag?: string }) {
  const flag = options.flag;
  if (flag !== undefined && flag !== 'w') {
    return writeFile(file, content, options);
  }
  // resolve links first so the rename replaces the target, not the link itself
  return new CancelablePromise<void, unknown>((resolve, _reject, { handleCancel }) => {
    let active: CancelablePromise<unknown, unknown> | undefined;
    handleCancel((reason) => {
      active?.cancel(reason);
    });
    resolve(
      resolveWriteTarget(file, MAX_LINK_HOPS, (pending) => {
        active = pending;
      }).then((target) => {
        active = replaceFile(target, content, options);
        return active.then(() => undefined);
      }),
    );
  });
}

export function writeJson(
  file: string,
  object: unknown,
  options?: IWriteJsonOptions | BufferEncoding | null,
): CancelablePromise<void, unknown> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let str: string;
    try {
      str = formatJson(object, options);
    } catch (err) {
      reject(err);
      return;
    }

    const opts = typeof options === 'string' ? { encoding: options } : (options ?? {});
    const writeOpts = {
      encoding: opts.encoding === undefined ? 'utf8' : opts.encoding,
      flag: opts.flag,
      mode: opts.mode,
    };

    const p = writeJsonContent(file, str, writeOpts);
    handleCancel((reason) => {
      p.cancel(reason);
    });

    resolve(p.then(() => undefined));
  });
}

export function writeJsonSync(
  file: string,
  object: unknown,
  options?: IWriteJsonOptions | BufferEncoding | null,
): void {
  const str = formatJson(object, options);
  const opts = typeof options === 'string' ? { encoding: options } : (options ?? {});
  const writeOpts = {
    encoding: opts.encoding === undefined ? 'utf8' : opts.encoding,
    flag: opts.flag,
    mode: opts.mode,
  };
  writeFileSync(file, str, writeOpts);
}

export function outputJson(
  file: string,
  data: unknown,
  options?: IOutputJsonOptions | BufferEncoding | null,
): CancelablePromise<void, unknown> {
  return new CancelablePromise((resolve, reject, { handleCancel }) => {
    let str: string;
    try {
      str = formatJson(data, options);
    } catch (err) {
      reject(err);
      return;
    }

    const opts = typeof options === 'string' ? { encoding: options } : (options ?? {});
    const writeOpts = {
      encoding: opts.encoding === undefined ? 'utf8' : opts.encoding,
      flag: opts.flag,
      mode: opts.mode,
    };

    let activePromise: CancelablePromise<unknown> | null = null;
    handleCancel((reason) => {
      activePromise?.cancel(reason);
    });

    activePromise = ensureDir(dirname(file));
    resolve(
      activePromise.then(() => {
        activePromise = writeJsonContent(file, str, writeOpts);
        return activePromise.then(() => undefined);
      }),
    );
  });
}

export function outputJsonSync(
  file: string,
  data: unknown,
  options?: IOutputJsonOptions | BufferEncoding | null,
): void {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  writeJsonSync(file, data, options);
}
