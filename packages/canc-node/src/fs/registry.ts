import nodeFs from 'node:fs';

type TFsFn = (...args: never[]) => unknown;

type TFsCallbackKeys =
  | 'appendFile'
  | 'chmod'
  | 'chown'
  | 'copyFile'
  | 'exists'
  | 'lchmod'
  | 'lchown'
  | 'lstat'
  | 'readFile'
  | 'readdir'
  | 'rename'
  | 'stat'
  | 'writeFile';

type TFsSyncKeys =
  | 'accessSync'
  | 'appendFileSync'
  | 'chmodSync'
  | 'chownSync'
  | 'closeSync'
  | 'copyFileSync'
  | 'cpSync'
  | 'existsSync'
  | 'fchmodSync'
  | 'fchownSync'
  | 'fdatasyncSync'
  | 'fstatSync'
  | 'fsyncSync'
  | 'ftruncateSync'
  | 'futimesSync'
  | 'lchmodSync'
  | 'lchownSync'
  | 'linkSync'
  | 'lstatSync'
  | 'lutimesSync'
  | 'mkdirSync'
  | 'mkdtempSync'
  | 'openSync'
  | 'opendirSync'
  | 'readFileSync'
  | 'readdirSync'
  | 'readlinkSync'
  | 'readSync'
  | 'readvSync'
  | 'realpathSync'
  | 'renameSync'
  | 'rmSync'
  | 'rmdirSync'
  | 'statSync'
  | 'statfsSync'
  | 'symlinkSync'
  | 'truncateSync'
  | 'unlinkSync'
  | 'utimesSync'
  | 'writeFileSync'
  | 'writeSync'
  | 'writevSync';

export type IFsPromisesLike = {
  open?: TFsFn;
  opendir?: TFsFn;
} & Record<string, unknown>;

export type IFsSurface = Partial<Record<TFsCallbackKeys | TFsSyncKeys, TFsFn>> & {
  promises?: IFsPromisesLike;
};

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = {
  [K in Keys]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[Keys];

/**
 * A structurally typed file system interface covering callback and synchronous operations.
 */
export type IFsLike = RequireAtLeastOne<IFsSurface>;

/**
 * Configuration options for the file system implementation registry.
 */
export interface ISetFsOptions {
  /**
   * Wrap open and opendir in an EMFILE retry, because graceful-fs cannot patch the promise API.
   *
   * @default false
   */
  retryOpen?: boolean;
}

let currentFs: IFsLike = nodeFs;
let currentOptions: ISetFsOptions = { retryOpen: false };

/**
 * Register a custom file system implementation and optional configuration.
 *
 * @param impl - File system implementation to use for callback and synchronous operations.
 * @param options - Additional options such as EMFILE retry behavior.
 */
export function setFs(impl: IFsLike, options?: ISetFsOptions): void {
  currentFs = impl;
  currentOptions = {
    retryOpen: options?.retryOpen ?? false,
  };
}

/**
 * Return the currently registered file system implementation, defaulting to `node:fs`.
 */
export function getFs(): IFsLike {
  return currentFs;
}

/**
 * Return the currently registered file system options.
 */
export function getFsOptions(): Readonly<Required<ISetFsOptions>> {
  return currentOptions as Readonly<Required<ISetFsOptions>>;
}

/**
 * Reset the registered file system implementation and options back to default (`node:fs`).
 * Intended for test cleanup only.
 */
export function resetFs(): void {
  currentFs = nodeFs;
  currentOptions = { retryOpen: false };
}
