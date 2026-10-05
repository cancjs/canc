import { createSocket as nodeCreateSocket, Socket as DgramSocket, SocketType } from 'node:dgram';

import { CancelablePromise } from '@cancjs/promise';

export type { Socket as DgramSocket, RemoteInfo, SocketOptions, SocketType } from 'node:dgram';
export { createSocket as nodeCreateSocket } from 'node:dgram';

/**
 * Creates a UDP socket.
 *
 * @param type The socket type.
 * @param callback Optional message handler callback.
 * @returns A UDP socket.
 */
export function createSocket(type: SocketType, callback?: (msg: Buffer, rinfo: any) => void): DgramSocket;
export function createSocket(options: any, callback?: (msg: Buffer, rinfo: any) => void): DgramSocket;
export function createSocket(typeOrOptions: any, callback?: (msg: Buffer, rinfo: any) => void): DgramSocket {
  return nodeCreateSocket(typeOrOptions, callback);
}

/**
 * Promisified UDP send, wrapping `socket.send`.
 *
 * Resolves when the datagram has been buffered for transmission. **A sent datagram cannot be
 * recalled**, so cancel is only meaningful before the syscall reaches the kernel.
 *
 * @param socket The UDP socket.
 * @param msg The message to send.
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
): CancelablePromise<number>;
export function send(
  socket: DgramSocket,
  msg: string | Uint8Array,
  port: number,
  addr?: string,
): CancelablePromise<number>;
export function send(
  socket: DgramSocket,
  msg: string | Uint8Array,
  offsetOrPort?: number,
  lengthOrAddr?: number | string,
  port?: number,
  addr?: string,
): CancelablePromise<number> {
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
    resolvedLength = typeof msg === 'string' ? msg.length : msg.length;
    resolvedPort = offsetOrPort!;
    resolvedAddr = lengthOrAddr as string | undefined;
  }

  return new CancelablePromise<number>((resolve, reject, { getSignal }) => {
    const signal = getSignal();

    // For send, cancel rejects the promise. Once queued to the kernel,
    // the datagram cannot be recalled.
    const onAbort = () => {
      reject(new Error('Canceled'));
    };
    signal.addEventListener('abort', onAbort);

    try {
      socket.send(msg, resolvedOffset, resolvedLength, resolvedPort, resolvedAddr, (err, bytes) => {
        signal.removeEventListener('abort', onAbort);

        if (err) {
          reject(err);
        } else {
          resolve(bytes);
        }
      });
    } catch (err) {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    }
  });
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
export function bind(socket: DgramSocket, port?: number, addr?: string): CancelablePromise<void> {
  return new CancelablePromise<void>((resolve, reject, { getSignal }) => {
    const signal = getSignal();
    let completed = false;

    const onAbort = () => {
      if (!completed) {
        try {
          socket.close();
        } catch {
          // Socket may not be running yet, which is fine
        }
      }
    };
    signal.addEventListener('abort', onAbort);

    try {
      socket.bind(port, addr, () => {
        completed = true;
        signal.removeEventListener('abort', onAbort);
        resolve();
      });
      socket.once('error', (err) => {
        completed = true;
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    } catch (err) {
      completed = true;
      signal.removeEventListener('abort', onAbort);
      reject(err);
    }
  });
}

/**
 * Connects the socket to a remote address.
 *
 * Canceling the promise closes the socket.
 *
 * @param socket The UDP socket.
 * @param port Remote port.
 * @param addr Remote address.
 * @returns A cancelable promise resolving when the socket is connected.
 */
export function connect(socket: DgramSocket, port: number, addr?: string): CancelablePromise<void> {
  return new CancelablePromise<void>((resolve, reject, { getSignal }) => {
    const signal = getSignal();
    let completed = false;

    const onAbort = () => {
      if (!completed) {
        try {
          socket.close();
        } catch {
          // Socket may not be running yet, which is fine
        }
      }
    };
    signal.addEventListener('abort', onAbort);

    try {
      socket.connect(port, addr, () => {
        completed = true;
        signal.removeEventListener('abort', onAbort);
        resolve();
      });
      socket.once('error', (err) => {
        completed = true;
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    } catch (err) {
      completed = true;
      signal.removeEventListener('abort', onAbort);
      reject(err);
    }
  });
}
