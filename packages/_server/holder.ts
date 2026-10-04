import { CancelablePromise, CancelSignal } from '@cancjs/promise';

import { ICancelableHandlerOptions, IRequestLike, IServerLike, IShutdownResult } from './types';

/**
 * Key the per-request cancel state is cached under. Registered through `Symbol.for`, so every copy
 * of this code, inlined into a different server package, reaches the same state object for the same
 * request. `server-node` owns the key because it is the layer every other adapter wires through;
 * the string resolves whether or not that package is installed.
 */
export const REQUEST_CANCEL_STATE = Symbol.for('@cancjs/server-node:RequestCancelState');

/**
 * Key the per-server set of live requests is cached under.
 *
 * This registry hangs off the `http.Server` instance and never off a module-level variable. This
 * directory is inlined into every server package, so a module-scope set would exist once per copy
 * and a shutdown would see only the requests its own copy happened to record. Per-server state has
 * no such split. Load-bearing, do not lift it to module scope.
 */
export const LIVE_REQUESTS = Symbol.for('@cancjs/server-node:LiveRequests');

/** Key the in-flight shutdown promise is cached under, so a second shutdown of the same server is a no-op. */
export const SHUTDOWN_STATE = Symbol.for('@cancjs/server-node:Shutdown');

/** Everything a request's cancellation is driven from, cached on the raw request object. */
export interface IRequestCancelState {
  signal: CancelSignal;
  cancel: (reason?: unknown) => void;
  options: ICancelableHandlerOptions;
  live: Set<CancelablePromise<unknown>>;
  timer?: unknown;
  /** Set by a shutdown before it cancels the signal, so a shutdown is not reported as a disconnect. */
  shuttingDown?: boolean;
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

/** Reads the live-request registry of a server, creating it only when asked to. */
export function getLiveRequests(
  server: IServerLike | undefined,
  create?: boolean,
): Set<IRequestCancelState> | undefined {
  if (!server) {
    return undefined;
  }

  let live = (server as TKeyed)[LIVE_REQUESTS] as Set<IRequestCancelState> | undefined;
  if (!live && create) {
    live = new Set<IRequestCancelState>();
    define(server, LIVE_REQUESTS, live);
  }

  return live;
}

/** Records a request as live on the server it arrived on. */
export function trackRequest(req: IRequestLike, state: IRequestCancelState): void {
  getLiveRequests(getRequestServer(req), true)?.add(state);
}

/** Drops a request from the server registry once its response is over. */
export function untrackRequest(req: IRequestLike, state: IRequestCancelState): void {
  getLiveRequests(getRequestServer(req))?.delete(state);
}

/** Reads the shutdown already running for a server, if any. */
export function getShutdownState(server: IServerLike): CancelablePromise<IShutdownResult> | undefined {
  return (server as TKeyed)[SHUTDOWN_STATE] as CancelablePromise<IShutdownResult> | undefined;
}

/** Caches the shutdown running for a server. */
export function setShutdownState(server: IServerLike, shutdown: CancelablePromise<IShutdownResult>): void {
  define(server, SHUTDOWN_STATE, shutdown);
}

/** Clears the shutdown running for a server. */
export function clearShutdownState(server: IServerLike, expected?: CancelablePromise<IShutdownResult>): void {
  if (expected === undefined || getShutdownState(server) === expected) {
    delete (server as TKeyed)[SHUTDOWN_STATE];
  }
}
