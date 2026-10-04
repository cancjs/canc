import { createErrorClass, wirePrototype } from '../../../_util/errors';
import { isObject } from '../../../_util/guards';

function brandPrototype(prototype: object, brand: symbol): void {
  Object.defineProperty(prototype, brand, { value: true });
}

function initError<T extends Error>(
  instance: T,
  name: string,
  defaultMessage: string,
  message?: string,
  options?: unknown,
  keys?: readonly string[],
): void {
  instance.name = name;
  instance.message = message !== undefined ? message : defaultMessage;
  if (options instanceof Error) {
    (instance as { cause?: unknown }).cause = options;
  } else if (options && isObject(options)) {
    const opts = options as Record<string, unknown>;
    if (keys) {
      for (const key of keys) {
        if (opts[key] !== undefined) {
          (instance as Record<string, unknown>)[key] = opts[key];
        }
      }
    }
  }
}

export const NOT_IMPLEMENTED_ERROR_BRAND = Symbol.for('@cancjs/node:NotImplementedError');
export const PROCESS_EXIT_ERROR_BRAND = Symbol.for('@cancjs/node:ProcessExitError');
export const PROCESS_SIGNAL_ERROR_BRAND = Symbol.for('@cancjs/node:ProcessSignalError');
export const PROCESS_SPAWN_ERROR_BRAND = Symbol.for('@cancjs/node:ProcessSpawnError');
export const PROCESS_MAX_BUFFER_ERROR_BRAND = Symbol.for('@cancjs/node:ProcessMaxBufferError');
export const PROCESS_IPC_ERROR_BRAND = Symbol.for('@cancjs/node:ProcessIpcError');
export const JSON_PARSE_ERROR_BRAND = Symbol.for('@cancjs/node:JsonParseError');

export interface INotImplementedErrorOptions {
  feature?: string;
  required?: string;
  cause?: unknown;
}

const BaseNotImplementedError = wirePrototype(
  createErrorClass('NotImplementedError', 'The requested feature is not implemented'),
  Error,
);

export class NotImplementedError extends BaseNotImplementedError {
  readonly feature?: string;
  readonly required?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: INotImplementedErrorOptions) {
    super(message);
    initError(this, 'NotImplementedError', 'The requested feature is not implemented', message, options, [
      'feature',
      'required',
      'cause',
    ]);
  }
}
brandPrototype(NotImplementedError.prototype, NOT_IMPLEMENTED_ERROR_BRAND);

export interface IProcessExitErrorOptions {
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  command?: string;
  cause?: unknown;
}

const BaseProcessExitError = wirePrototype(
  createErrorClass('ProcessExitError', 'Process exited with a non-zero exit code'),
  Error,
);

export class ProcessExitError extends BaseProcessExitError {
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly stdout?: string | Buffer;
  readonly stderr?: string | Buffer;
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessExitErrorOptions) {
    super(message);
    initError(this, 'ProcessExitError', 'Process exited with a non-zero exit code', message, options, [
      'exitCode',
      'signal',
      'stdout',
      'stderr',
      'command',
      'cause',
    ]);
  }
}
brandPrototype(ProcessExitError.prototype, PROCESS_EXIT_ERROR_BRAND);

export interface IProcessSignalErrorOptions {
  signal?: string | null;
  command?: string;
  cause?: unknown;
}

const BaseProcessSignalError = wirePrototype(
  createErrorClass('ProcessSignalError', 'Process was terminated by a signal'),
  Error,
);

export class ProcessSignalError extends BaseProcessSignalError {
  readonly signal?: string | null;
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessSignalErrorOptions) {
    super(message);
    initError(this, 'ProcessSignalError', 'Process was terminated by a signal', message, options, [
      'signal',
      'command',
      'cause',
    ]);
  }
}
brandPrototype(ProcessSignalError.prototype, PROCESS_SIGNAL_ERROR_BRAND);

export interface IProcessSpawnErrorOptions {
  code?: string;
  command?: string;
  cause?: unknown;
}

const BaseProcessSpawnError = wirePrototype(
  createErrorClass('ProcessSpawnError', 'Process could not be spawned'),
  Error,
);

export class ProcessSpawnError extends BaseProcessSpawnError {
  readonly code?: string;
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessSpawnErrorOptions) {
    super(message);
    initError(this, 'ProcessSpawnError', 'Process could not be spawned', message, options, [
      'code',
      'command',
      'cause',
    ]);
  }
}
brandPrototype(ProcessSpawnError.prototype, PROCESS_SPAWN_ERROR_BRAND);

export interface IProcessMaxBufferErrorOptions {
  command?: string;
  cause?: unknown;
}

const BaseProcessMaxBufferError = wirePrototype(
  createErrorClass('ProcessMaxBufferError', 'Process stdio exceeded maxBuffer'),
  Error,
);

export class ProcessMaxBufferError extends BaseProcessMaxBufferError {
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessMaxBufferErrorOptions) {
    super(message);
    initError(this, 'ProcessMaxBufferError', 'Process stdio exceeded maxBuffer', message, options, [
      'command',
      'cause',
    ]);
  }
}
brandPrototype(ProcessMaxBufferError.prototype, PROCESS_MAX_BUFFER_ERROR_BRAND);

export interface IProcessIpcErrorOptions {
  cause?: unknown;
}

const BaseProcessIpcError = wirePrototype(
  createErrorClass('ProcessIpcError', 'Process IPC channel disconnected'),
  Error,
);

export class ProcessIpcError extends BaseProcessIpcError {
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessIpcErrorOptions) {
    super(message);
    initError(this, 'ProcessIpcError', 'Process IPC channel disconnected', message, options, ['cause']);
  }
}
brandPrototype(ProcessIpcError.prototype, PROCESS_IPC_ERROR_BRAND);

export interface IJsonParseErrorOptions {
  path?: string;
  cause?: unknown;
}

const BaseJsonParseError = wirePrototype(createErrorClass('JsonParseError', 'Failed to parse JSON'), Error);

export class JsonParseError extends BaseJsonParseError {
  readonly path?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IJsonParseErrorOptions | Error) {
    super(message);
    initError(this, 'JsonParseError', 'Failed to parse JSON', message, options, ['path', 'cause']);
  }
}
brandPrototype(JsonParseError.prototype, JSON_PARSE_ERROR_BRAND);

export const isNotImplementedError = (error: unknown): error is NotImplementedError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[NOT_IMPLEMENTED_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'NotImplementedError');

export const isProcessExitError = (error: unknown): error is ProcessExitError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[PROCESS_EXIT_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'ProcessExitError');

export const isProcessSignalError = (error: unknown): error is ProcessSignalError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[PROCESS_SIGNAL_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'ProcessSignalError');

export const isProcessSpawnError = (error: unknown): error is ProcessSpawnError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[PROCESS_SPAWN_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'ProcessSpawnError');

export const isProcessMaxBufferError = (error: unknown): error is ProcessMaxBufferError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[PROCESS_MAX_BUFFER_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'ProcessMaxBufferError');

export const isProcessIpcError = (error: unknown): error is ProcessIpcError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[PROCESS_IPC_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'ProcessIpcError');

export const isJsonParseError = (error: unknown): error is JsonParseError =>
  isObject(error) &&
  ((error as Record<symbol, unknown>)[JSON_PARSE_ERROR_BRAND] === true ||
    (error as { name?: unknown }).name === 'JsonParseError');
