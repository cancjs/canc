import { CancelablePromise, CancelSignal } from '@cancjs/promise';

import { isFunction } from '../_util';
import {
  ICancelableHandlerOptions,
  IRequestLike,
  IResponseLike,
  IServerLike,
  IShutdownOptions,
  IShutdownResult,
} from './types';

/**
 * Key the per-request cancel state is cached under. Registered through `Symbol.for`, so every copy
 * of this code, inlined into a different server package, reaches the same state object for the same
 * request. `server-node` owns the key because it is the layer every other adapter wires through;
 * the string resolves whether or not that package is installed.
 */
export const REQUEST_CANCEL_STATE = Symbol.for('@cancjs/server-node:RequestCancelState');

/**
 * Key the per-server request registry is cached under.
 *
 * This registry hangs off the `http.Server` instance and never off a module-level variable. This
 * directory is inlined into every server package, so a module-scope set would exist once per copy
 * and a shutdown would see only the requests its own copy happened to record. Per-server state has
 * no such split. Load-bearing, do not lift it to module scope.
 */
export const REQUEST_REGISTRY = Symbol.for('@cancjs/server-node:RequestRegistry');

/** Key the in-flight shutdown promise is cached under, so a second shutdown of the same server is a no-op. */
export const SHUTDOWN_STATE = Symbol.for('@cancjs/server-node:Shutdown');

/**
 * Key the function `createShutdown` returned is cached under, on the object it was given, so a
 * second call for the same server, from any copy of this code, hands back the same function.
 */
export const SHUTDOWN_FUNCTION = Symbol.for('@cancjs/server-node:ShutdownFunction');

/** Runs a graceful shutdown, or returns the one already running. */
export type TShutdownFunction = (options?: IShutdownOptions) => Promise<IShutdownResult>;

/** Everything a request's cancellation is driven from, cached on the raw request object. */
export interface IRequestCancelState {
  signal: CancelSignal;
  cancel: (reason?: unknown) => void;
  options: ICancelableHandlerOptions;
  live: Set<CancelablePromise<unknown>>;
  /** The response the state was installed with. A shutdown waits on it closing. Absent on the Web path. */
  response?: IResponseLike;
  /** The pending deadline, one per request however many layers set a timeout. */
  timer?: unknown;
  /** Lifecycle callbacks of every layer on the request, the latest winning per key. Reported once. */
  hooks?: Pick<ICancelableHandlerOptions, 'onDisconnect' | 'onTimeout'>;
  /** Handler tasks still answering for the request rather than handing it on. The deadline ends at zero. */
  holding?: number;
  /** Set once a cancellation went to the framework's error pipeline, which takes one per request. */
  cancelForwarded?: boolean;
  /** Set by a shutdown before it cancels the signal, so a shutdown is not reported as a disconnect. */
  shuttingDown?: boolean;
  /** Set by a shutdown, so a handler task started while it drains is still counted. */
  watch?: (task: CancelablePromise<unknown>) => void;
}

type TKeyed = Record<symbol, unknown>;

function define(target: object, key: symbol, value: unknown): void {
  // Non-enumerable so the state never shows up in a request dump, a log serializer or a spread.
  Object.defineProperty(target, key, { configurable: true, value, writable: true });
}

/** Reads the cancel state cached on a request, if one has been installed. */
export function getRequestState(req: IRequestLike): IRequestCancelState | undefined {
  return (req as TKeyed)[REQUEST_CANCEL_STATE] as IRequestCancelState | undefined;
}

/** Caches the cancel state on a request. */
export function setRequestState(req: IRequestLike, state: IRequestCancelState): void {
  define(req, REQUEST_CANCEL_STATE, state);
}

/**
 * The server a request arrived on. Node sets `server` on every socket its own listener created, so
 * this is how a handler reaches the object shutdown is called with without the caller threading it.
 */
export function getRequestServer(req: IRequestLike): IServerLike | undefined {
  const socket = req.socket as { server?: unknown } | null | undefined;
  const server = socket?.server;

  return server && typeof server === 'object' ? (server as IServerLike) : undefined;
}

/** The part of a connection socket a shutdown closes. */
export interface IConnectionLike {
  bytesRead?: number;
  destroyed?: boolean;
  destroy?: () => unknown;
  destroySoon?: () => void;
  end?: () => unknown;
  once?: (event: 'close', listener: () => void) => unknown;
}

/**
 * Every request a server is still answering that this layer has seen, keyed by its response.
 *
 * Fed by a `request` listener prepended the first time this layer meets the server, so requests
 * that never reach a wrapped handler are recorded too. An entry leaves when its response closes.
 */
export interface IRequestRegistry {
  open: Map<IResponseLike, IRequestLike>;
  /** Every connection still open that the server accepted since `createShutdown`, with its accept time. */
  connections?: Map<IConnectionLike, number>;
  /** Set while a shutdown runs, told about each request recorded during it. */
  onArrival?: (req: IRequestLike, res: IResponseLike) => void;
  /** Set while a shutdown runs, told about each request that gains cancel state during it. */
  onTrack?: (state: IRequestCancelState) => void;
}

type TRequestListener = (req: unknown, res: unknown) => void;

interface IListenerHost {
  prependListener?: (event: 'request', listener: TRequestListener) => unknown;
  on?: (event: 'connection' | 'secureConnection', listener: (socket: unknown) => void) => unknown;
  // only a TLS server has it, and there a request's socket is the one `secureConnection` hands out
  addContext?: unknown;
}

/**
 * Reads the request registry of a server. With `create`, a server met for the first time gets one,
 * and its `request` listener goes first so later arrivals are recorded before the application runs.
 */
export function getRequestRegistry(server: IServerLike | undefined, create?: boolean): IRequestRegistry | undefined {
  if (!server) {
    return undefined;
  }

  let registry = (server as TKeyed)[REQUEST_REGISTRY] as IRequestRegistry | undefined;
  if (!registry && create) {
    const created: IRequestRegistry = { open: new Map() };
    define(server, REQUEST_REGISTRY, created);

    const host = server as IListenerHost;
    if (typeof host.prependListener === 'function') {
      host.prependListener('request', (req, res) => {
        recordRequest(created, req as IRequestLike, res as IResponseLike);
      });
    }

    registry = created;
  }

  return registry;
}

/**
 * Records every connection a server accepts from now on, until it closes, so a shutdown can close
 * one that has received no bytes. Node keeps no such list, and `closeIdleConnections()` skips them.
 */
export function trackConnections(server: IServerLike): void {
  const registry = getRequestRegistry(server, true);
  if (!registry || registry.connections) {
    return;
  }

  const connections = new Map<IConnectionLike, number>();
  registry.connections = connections;

  const host = server as IListenerHost;
  if (isFunction(host.on)) {
    host.on(isFunction(host.addContext) ? 'secureConnection' : 'connection', (socket) => {
      const connection = socket as IConnectionLike;
      connections.set(connection, Date.now());
      connection.once?.('close', () => {
        connections.delete(connection);
      });
    });
  }
}

/** Reads the shutdown function cached on a server or an application, if any. */
export function getShutdownFunction(target: object): TShutdownFunction | undefined {
  const cached = (target as TKeyed)[SHUTDOWN_FUNCTION];

  return typeof cached === 'function' ? (cached as TShutdownFunction) : undefined;
}

/** Caches the shutdown function on a server or an application. */
export function setShutdownFunction(target: object, shutdown: TShutdownFunction): void {
  define(target, SHUTDOWN_FUNCTION, shutdown);
}

/** Adds a request to a registry until its response closes. A closed response is left out. */
export function recordRequest(registry: IRequestRegistry, req: IRequestLike, res: IResponseLike): void {
  if (registry.open.has(res) || (res as { closed?: unknown }).closed === true) {
    return;
  }

  registry.open.set(res, req);
  res.once('close', () => {
    registry.open.delete(res);
  });
  registry.onArrival?.(req, res);
}

/**
 * Records a request with cancel state on the server it arrived on. The first request a server is
 * met through is recorded here, since its own `request` event went out before the listener existed.
 */
export function trackRequest(req: IRequestLike, state: IRequestCancelState): void {
  const registry = getRequestRegistry(getRequestServer(req), true);

  if (!registry || !state.response) {
    return;
  }

  recordRequest(registry, req, state.response);
  registry.onTrack?.(state);
}

/** Reads the shutdown already running for a server, if any. */
export function getShutdownState(server: IServerLike): CancelablePromise<IShutdownResult, never> | undefined {
  if (server === null || (typeof server !== 'object' && typeof server !== 'function')) {
    throw new TypeError(
      `createShutdown() needs the http server as its first argument, got ${server === null ? 'null' : typeof server}.`,
    );
  }

  return (server as TKeyed)[SHUTDOWN_STATE] as CancelablePromise<IShutdownResult, never> | undefined;
}

/** Caches the shutdown running for a server. */
export function setShutdownState(server: IServerLike, shutdown: CancelablePromise<IShutdownResult, never>): void {
  define(server, SHUTDOWN_STATE, shutdown);
}

/** Clears the shutdown running for a server. */
export function clearShutdownState(server: IServerLike, expected?: CancelablePromise<IShutdownResult, never>): void {
  if (expected === undefined || getShutdownState(server) === expected) {
    delete (server as TKeyed)[SHUTDOWN_STATE];
  }
}
