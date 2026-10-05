import { exists } from '../fs';

export { copy, type ICopyOptions } from './copy';
export { emptyDir, emptyDirSync } from './empty-dir';
export {
  ensureDir,
  ensureDirSync,
  ensureFile,
  ensureFileSync,
  ensureLink,
  ensureLinkSync,
  ensureSymlink,
  ensureSymlinkSync,
  mkdirp,
  mkdirpSync,
  mkdirs,
  mkdirsSync,
} from './ensure';
export type { IOutputJsonOptions, IReadJsonOptions, IWriteJsonOptions } from './json';
export { outputJson, outputJsonSync, readJson, readJsonSync, writeJson, writeJsonSync } from './json';
export type { IMoveOptions } from './move';
export { move, moveSync } from './move';
export type { IOutputFileOptions, IOutputFileSyncOptions } from './output';
export { outputFile, outputFileSync } from './output';
export type { IReplaceFileOptions, IReplaceFileSyncOptions } from './replace-file';
export { replaceFile, replaceFileSync } from './replace-file';
export type { IWalkEntry, IWalkOptions, IWalkSyncOptions, TWalkOnError, TWalkOrder } from './walk';
export { walk, walkSync } from './walk';

/** fs-extra spells the fs `exists` probe this way. */
export const pathExists = exists;
