/** The shape every node syscall error has. `code` is the only portable discriminant. */
export interface NodeErrnoError<TCode extends string = string> extends Error {
  readonly code: TCode;
  readonly errno?: number;
  readonly syscall?: string;
  readonly path?: string;
}

export type ENOENT = NodeErrnoError<'ENOENT'>;
export type EACCES = NodeErrnoError<'EACCES'>;
export type EPERM = NodeErrnoError<'EPERM'>;
export type EROFS = NodeErrnoError<'EROFS'>;
export type EEXIST = NodeErrnoError<'EEXIST'>;
export type EISDIR = NodeErrnoError<'EISDIR'>;
export type ENOTDIR = NodeErrnoError<'ENOTDIR'>;
export type ENOTEMPTY = NodeErrnoError<'ENOTEMPTY'>;
export type EBUSY = NodeErrnoError<'EBUSY'>;
export type EAGAIN = NodeErrnoError<'EAGAIN'>;
export type EMFILE = NodeErrnoError<'EMFILE'>;
export type ENFILE = NodeErrnoError<'ENFILE'>;
export type ENOSPC = NodeErrnoError<'ENOSPC'>;
export type EDQUOT = NodeErrnoError<'EDQUOT'>;
export type EXDEV = NodeErrnoError<'EXDEV'>;
export type ELOOP = NodeErrnoError<'ELOOP'>;
export type ENAMETOOLONG = NodeErrnoError<'ENAMETOOLONG'>;
export type EINVAL = NodeErrnoError<'EINVAL'>;
export type EIO = NodeErrnoError<'EIO'>;
export type EPIPE = NodeErrnoError<'EPIPE'>;
export type ECONNREFUSED = NodeErrnoError<'ECONNREFUSED'>;
export type ECONNRESET = NodeErrnoError<'ECONNRESET'>;
export type ETIMEDOUT = NodeErrnoError<'ETIMEDOUT'>;
export type EHOSTUNREACH = NodeErrnoError<'EHOSTUNREACH'>;
export type ENETUNREACH = NodeErrnoError<'ENETUNREACH'>;
export type EADDRINUSE = NodeErrnoError<'EADDRINUSE'>;
export type EADDRNOTAVAIL = NodeErrnoError<'EADDRNOTAVAIL'>;
export type EMSGSIZE = NodeErrnoError<'EMSGSIZE'>;
export type ENOTFOUND = NodeErrnoError<'ENOTFOUND'>;
export type ENODATA = NodeErrnoError<'ENODATA'>;
export type ESERVFAIL = NodeErrnoError<'ESERVFAIL'>;
export type EREFUSED = NodeErrnoError<'EREFUSED'>;
export type EBADNAME = NodeErrnoError<'EBADNAME'>;
export type EFORMERR = NodeErrnoError<'EFORMERR'>;
export type ECANCELLED = NodeErrnoError<'ECANCELLED'>;

export const isErrno =
  <TCode extends string>(code: TCode) =>
  (error: unknown): error is NodeErrnoError<TCode> =>
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;

export const isNotFoundError = isErrno('ENOENT');

export const isPermissionError = (error: unknown): error is EACCES | EPERM | EROFS | { name: 'NotCapable' } => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return (
    code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || (error as { name?: unknown }).name === 'NotCapable'
  );
};

export const isExistsError = isErrno('EEXIST');
export const isIsDirError = isErrno('EISDIR');
export const isNotDirError = isErrno('ENOTDIR');
export const isNotEmptyError = isErrno('ENOTEMPTY');

export const isBusyError = (error: unknown): error is EBUSY | EAGAIN => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === 'EBUSY' || code === 'EAGAIN';
};

export const isNoSpaceError = (error: unknown): error is ENOSPC | EDQUOT => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === 'ENOSPC' || code === 'EDQUOT';
};

export const isTooManyFilesError = (error: unknown): error is EMFILE | ENFILE => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === 'EMFILE' || code === 'ENFILE';
};

export const isCrossDeviceError = isErrno('EXDEV');
