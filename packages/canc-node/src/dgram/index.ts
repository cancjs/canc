import {
  createSocket as nodeCreateSocket,
  RemoteInfo,
  Socket as DgramSocket,
  SocketOptions,
  SocketType,
} from 'node:dgram';

import { CancelablePromise } from '@cancjs/promise';

import type { Unlisted } from '../../../_util';

export type { Socket as DgramSocket, RemoteInfo, SocketOptions, SocketType } from 'node:dgram';
export { createSocket as nodeCreateSocket } from 'node:dgram';

/**
 * Creates a UDP socket.
 *
 * @param type The socket type.
 * @param callback Optional message handler callback.
 * @returns A UDP socket.
 */
export function createSocket(type: SocketType, callback?: (msg: Buffer, rinfo: RemoteInfo) => void): DgramSocket;
export function createSocket(options: SocketOptions, callback?: (msg: Buffer, rinfo: RemoteInfo) => void): DgramSocket;
export function createSocket(
  typeOrOptions: SocketType | SocketOptions,
  callback?: (msg: Buffer, rinfo: RemoteInfo) => void,
): DgramSocket {
  return typeof typeOrOptions === 'string' ?
      nodeCreateSocket(typeOrOptions, callback)
    : nodeCreateSocket(typeOrOptions, callback);
}

/**
 * Promisified UDP send, wrapping `socket.send`.
 *
 * Resolves when the datagram has been buffered for transmission. **A sent datagram cannot be
 * recalled**: canceling stops waiting for the callback, but a datagram already handed to
 * `socket.send` is still delivered.
 *
 * @param socket The UDP socket.
 * @param msg The message to send. A string is sent as its UTF-8 bytes.
 * @param offset Offset into the buffer.
 * @param length Length of the message.
 * @param port Remote port.
 * @param addr Remote address.
 * @returns A cancelable promise resolving to the number of bytes sent.
 */
export function send(
  socket: DgramSocket,
  msg: string | Uint8Array,
  offset: number,
  length: number,
  port: number,
  addr?: string,
): CancelablePromise<number, Unlisted>;
export function send(
  socket: DgramSocket,
  msg: string | Uint8Array,
  port: number,
  addr?: string,
): CancelablePromise<number, Unlisted>;
export function send(
  socket: DgramSocket,
  msg: string | Uint8Array,
  offsetOrPort?: number,
  lengthOrAddr?: number | string,
  port?: number,
  addr?: string,
): CancelablePromise<number, Unlisted> {
  // a string's length is its character count, not its byte count: encode once and size by bytes
  const data = typeof msg === 'string' ? Buffer.from(msg, 'utf8') : msg;

  // Overload resolution: disambiguate offset vs port based on arg count and types
  let resolvedOffset: number;
  let resolvedLength: number;
  let resolvedPort: number;
  let resolvedAddr: string | undefined;

  if (typeof lengthOrAddr === 'number') {
    // 6-arg form: offset, length, port, addr
    resolvedOffset = offsetOrPort!;
    resolvedLength = lengthOrAddr;
    resolvedPort = port!;
    resolvedAddr = addr;
  } else {
    // 4-arg form: port, addr
    resolvedOffset = 0;
    resolvedLength = data.byteLength;
    resolvedPort = offsetOrPort!;
    resolvedAddr = lengthOrAddr as string | undefined;
  }

  return new CancelablePromise<number, Unlisted>((resolve, reject) => {
    try {
      socket.send(data, resolvedOffset, resolvedLength, resolvedPort, resolvedAddr, (err, bytes) => {
        if (err) {
          reject(err);
        } else {
          resolve(bytes);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Shared shape of {@link bind} and {@link connect}: one pending socket call, settled once.
 *
 * The `error` listener exists only while the call is pending. It is removed on settle, so a later
 * socket error reaches the caller's own listeners (or crashes, as node intends) rather than being
 * swallowed here. Canceling a pending call closes the socket.
 */
function settleSocketCall(
  socket: DgramSocket,
  signal: Pick<AbortSignal, 'addEventListener' | 'removeEventListener'>,
  resolve: () => void,
  reject: (err: unknown) => void,
  start: (done: (err?: Error | null) => void) => void,
): void {
  let settled = false;

  const onAbort = () => {
    if (settled) {
      return;
    }
    settled = true;
    socket.removeListener('error', finish);
    try {
      socket.close();
    } catch {
      // Socket may not be running yet, which is fine
    }
  };

  const finish = (err?: Error | null) => {
    if (settled) {
      return;
    }
    settled = true;
    socket.removeListener('error', finish);
    signal.removeEventListener('abort', onAbort);
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  };

  signal.addEventListener('abort', onAbort);
  socket.on('error', finish);

  try {
    start(finish);
  } catch (err) {
    finish(err as Error);
  }
}

/**
 * Binds the socket to a local port and address.
 *
 * Canceling the promise closes the socket, freeing the port.
 *
 * @param socket The UDP socket.
 * @param port Local port.
 * @param addr Local address.
 * @returns A cancelable promise resolving when the socket is bound.
 */
export function bind(socket: DgramSocket, port?: number, addr?: string): CancelablePromise<void, Unlisted> {
  return new CancelablePromise<void, Unlisted>((resolve, reject, { getSignal }) => {
    settleSocketCall(socket, getSignal(), resolve, reject, (done) => {
      socket.bind(port, addr, () => done());
    });
  });
}

/**
 * Connects the socket to a remote address.
 *
 * Canceling the promise closes the socket. A failed connect (for example an unresolvable host)
 * rejects with node's error and leaves the socket unconnected.
 *
 * @param socket The UDP socket.
 * @param port Remote port.
 * @param addr Remote address.
 * @returns A cancelable promise resolving when the socket is connected.
 */
export function connect(socket: DgramSocket, port: number, addr?: string): CancelablePromise<void, Unlisted> {
  return new CancelablePromise<void, Unlisted>((resolve, reject, { getSignal }) => {
    settleSocketCall(socket, getSignal(), resolve, reject, (done) => {
      socket.connect(port, addr, (err?: Error | null) => done(err));
    });
  });
}
