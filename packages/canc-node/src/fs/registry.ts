import nodeFs from 'node:fs';

/**
 * A structurally typed file system interface covering callback and synchronous operations.
 */
export type IFsLike = Record<string, any>;

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
