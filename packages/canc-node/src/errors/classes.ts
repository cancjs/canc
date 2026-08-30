import { createErrorClass } from '../../../_util/errors';
import { isObject } from '../../../_util/guards';

function brandPrototype(prototype: object, brand: symbol): void {
  Object.defineProperty(prototype, brand, { value: true });
}

function wirePrototype(cls: { prototype: object }): void {
  if (typeof Object.setPrototypeOf === 'function') {
    Object.setPrototypeOf(cls.prototype, Error.prototype);
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

const BaseNotImplementedError = createErrorClass('NotImplementedError', 'The requested feature is not implemented');
wirePrototype(BaseNotImplementedError);

export class NotImplementedError extends BaseNotImplementedError {
  readonly feature?: string;
  readonly required?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: INotImplementedErrorOptions) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'NotImplementedError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'The requested feature is not implemented';
    }
    if (options && isObject(options)) {
      if (options.feature !== undefined) {
        this.feature = options.feature;
      }
      if (options.required !== undefined) {
        this.required = options.required;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
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

const BaseProcessExitError = createErrorClass('ProcessExitError', 'Process exited with a non-zero exit code');
wirePrototype(BaseProcessExitError);

export class ProcessExitError extends BaseProcessExitError {
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly stdout?: string | Buffer;
  readonly stderr?: string | Buffer;
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessExitErrorOptions) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ProcessExitError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'Process exited with a non-zero exit code';
    }
    if (options && isObject(options)) {
      if (options.exitCode !== undefined) {
        this.exitCode = options.exitCode;
      }
      if (options.signal !== undefined) {
        this.signal = options.signal;
      }
      if (options.stdout !== undefined) {
        this.stdout = options.stdout;
      }
      if (options.stderr !== undefined) {
        this.stderr = options.stderr;
      }
      if (options.command !== undefined) {
        this.command = options.command;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }
}
brandPrototype(ProcessExitError.prototype, PROCESS_EXIT_ERROR_BRAND);

export interface IProcessSignalErrorOptions {
  signal?: string | null;
  command?: string;
  cause?: unknown;
}

const BaseProcessSignalError = createErrorClass('ProcessSignalError', 'Process was terminated by a signal');
wirePrototype(BaseProcessSignalError);

export class ProcessSignalError extends BaseProcessSignalError {
  readonly signal?: string | null;
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessSignalErrorOptions) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ProcessSignalError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'Process was terminated by a signal';
    }
    if (options && isObject(options)) {
      if (options.signal !== undefined) {
        this.signal = options.signal;
      }
      if (options.command !== undefined) {
        this.command = options.command;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }
}
brandPrototype(ProcessSignalError.prototype, PROCESS_SIGNAL_ERROR_BRAND);

export interface IProcessSpawnErrorOptions {
  code?: string;
  command?: string;
  cause?: unknown;
}

const BaseProcessSpawnError = createErrorClass('ProcessSpawnError', 'Process could not be spawned');
wirePrototype(BaseProcessSpawnError);

export class ProcessSpawnError extends BaseProcessSpawnError {
  readonly code?: string;
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessSpawnErrorOptions) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ProcessSpawnError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'Process could not be spawned';
    }
    if (options && isObject(options)) {
      if (options.code !== undefined) {
        Object.defineProperty(this, 'code', {
          configurable: true,
          enumerable: true,
          value: options.code,
          writable: true,
        });
      }
      if (options.command !== undefined) {
        this.command = options.command;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }
}
brandPrototype(ProcessSpawnError.prototype, PROCESS_SPAWN_ERROR_BRAND);

export interface IProcessMaxBufferErrorOptions {
  command?: string;
  cause?: unknown;
}

const BaseProcessMaxBufferError = createErrorClass('ProcessMaxBufferError', 'Process stdio exceeded maxBuffer');
wirePrototype(BaseProcessMaxBufferError);

export class ProcessMaxBufferError extends BaseProcessMaxBufferError {
  readonly command?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessMaxBufferErrorOptions) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ProcessMaxBufferError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'Process stdio exceeded maxBuffer';
    }
    if (options && isObject(options)) {
      if (options.command !== undefined) {
        this.command = options.command;
      }
      if (options.cause !== undefined) {
        this.cause = options.cause;
      }
    }
  }
}
brandPrototype(ProcessMaxBufferError.prototype, PROCESS_MAX_BUFFER_ERROR_BRAND);

export interface IProcessIpcErrorOptions {
  cause?: unknown;
}

const BaseProcessIpcError = createErrorClass('ProcessIpcError', 'Process IPC channel disconnected');
wirePrototype(BaseProcessIpcError);

export class ProcessIpcError extends BaseProcessIpcError {
  readonly cause?: unknown;

  constructor(message?: string, options?: IProcessIpcErrorOptions) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ProcessIpcError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'Process IPC channel disconnected';
    }
    if (options && isObject(options) && options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
brandPrototype(ProcessIpcError.prototype, PROCESS_IPC_ERROR_BRAND);

export interface IJsonParseErrorOptions {
  path?: string;
  cause?: unknown;
}

const BaseJsonParseError = createErrorClass('JsonParseError', 'Failed to parse JSON');
wirePrototype(BaseJsonParseError);

export class JsonParseError extends BaseJsonParseError {
  readonly path?: string;
  readonly cause?: unknown;

  constructor(message?: string, options?: IJsonParseErrorOptions | Error) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'JsonParseError';
    if (message !== undefined) {
      this.message = message;
    } else {
      this.message = 'Failed to parse JSON';
    }
    if (options instanceof Error) {
      this.cause = options;
    } else if (options && isObject(options)) {
      const opts = options as IJsonParseErrorOptions;
      if (opts.path !== undefined) {
        this.path = opts.path;
      }
      if (opts.cause !== undefined) {
        this.cause = opts.cause;
      }
    }
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
