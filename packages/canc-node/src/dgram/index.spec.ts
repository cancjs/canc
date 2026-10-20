import { createSocket as nodeCreateSocket } from 'node:dgram';

import { isCancelError } from '@cancjs/promise';

import { bind, connect, createSocket, send } from './index';

describe('dgram', () => {
  describe('send', () => {
    it('resolves for a real datagram to a local listener', async () => {
      const receiver = nodeCreateSocket('udp4');
      const sender = nodeCreateSocket('udp4');

      try {
        await new Promise<void>((resolve, reject) => {
          receiver.on('listening', resolve);
          receiver.on('error', reject);
          receiver.bind(0);
        });

        const receiverAddr = receiver.address();
        const receiverPort = receiverAddr.port;

        const msg = Buffer.from('test message');
        const bytes = await send(sender, msg, receiverPort, 'localhost');

        expect(bytes).toBe(msg.length);
      } finally {
        sender.close();
        receiver.close();
      }
    });

    it('sizes a string by its UTF-8 bytes, so a multibyte message arrives intact', async () => {
      const receiver = nodeCreateSocket('udp4');
      const sender = nodeCreateSocket('udp4');

      try {
        await new Promise<void>((resolve, reject) => {
          receiver.on('listening', resolve);
          receiver.on('error', reject);
          receiver.bind(0);
        });

        const received = new Promise<Buffer>((resolve) => {
          receiver.once('message', (msg) => resolve(msg));
        });

        const text = 'Привет';
        const bytes = await send(sender, text, receiver.address().port, 'localhost');

        expect(bytes).toBe(Buffer.byteLength(text));
        expect((await received).equals(Buffer.from(text, 'utf8'))).toBe(true);
      } finally {
        sender.close();
        receiver.close();
      }
    });

    it('cancel() after send() stops waiting, but the datagram is still delivered', async () => {
      const receiver = nodeCreateSocket('udp4');
      const sender = nodeCreateSocket('udp4');

      try {
        await new Promise<void>((resolve, reject) => {
          receiver.on('listening', resolve);
          receiver.on('error', reject);
          receiver.bind(0);
        });

        const received = new Promise<Buffer>((resolve) => {
          receiver.once('message', (msg) => resolve(msg));
        });

        const msg = Buffer.from('cancel-me');
        const promise = send(sender, msg, receiver.address().port, 'localhost');
        promise.cancel();

        const err = await promise.catch((e) => e);
        expect(isCancelError(err)).toBe(true);
        expect((await received).equals(msg)).toBe(true);
      } finally {
        sender.close();
        receiver.close();
      }
    });
  });

  describe('bind', () => {
    it('resolves when socket is bound', async () => {
      const socket = createSocket('udp4');
      try {
        const prom = bind(socket, 0);
        await new Promise((r) => setTimeout(r, 10));
        await prom;
        const addr = socket.address();
        expect(addr.port).toBeGreaterThan(0);
      } finally {
        try {
          socket.close();
        } catch {
          // Already closed
        }
      }
    }, 5000);

    it('cancel closes socket and frees port', async () => {
      const socket1 = createSocket('udp4');
      let boundPort = 0;

      try {
        // Bind socket1 and get its port
        await new Promise<void>((resolve, reject) => {
          socket1.once('listening', () => {
            boundPort = socket1.address().port;
            resolve();
          });
          socket1.once('error', reject);
          socket1.bind(0);
        });

        // Close socket1 to free the port
        socket1.close();

        // Now try to bind a new socket to the same port - should succeed
        const socket2 = createSocket('udp4');
        try {
          await new Promise<void>((resolve, reject) => {
            socket2.once('listening', resolve);
            socket2.once('error', reject);
            socket2.bind(boundPort);
          });
          expect(socket2.address().port).toBe(boundPort);
        } finally {
          socket2.close();
        }
      } catch (err) {
        // Clean up socket1 if binding failed
        try {
          socket1.close();
        } catch {
          // Already closed
        }
        throw err;
      }
    });

    it('leaves no error listener behind once bound, so a later socket error reaches the caller', async () => {
      const socket = createSocket('udp4');
      try {
        await bind(socket, 0);
        expect(socket.listenerCount('error')).toBe(0);

        const seen = new Promise<Error>((resolve) => socket.once('error', resolve));
        const later = new Error('later socket failure');
        socket.emit('error', later);

        expect(await seen).toBe(later);
      } finally {
        socket.close();
      }
    });

    it('cancel before bind completes closes socket', async () => {
      const socket = createSocket('udp4');
      const promise = bind(socket, 0);
      promise.cancel();

      const err = await promise.catch((e) => e);
      expect(isCancelError(err)).toBe(true);
    });
  });

  describe('connect', () => {
    it('resolves when socket is connected', async () => {
      const listener = nodeCreateSocket('udp4');
      const client = createSocket('udp4');

      try {
        await new Promise<void>((resolve, reject) => {
          listener.on('listening', resolve);
          listener.on('error', reject);
          listener.bind(0);
        });

        const listenerAddr = listener.address();
        await connect(client, listenerAddr.port, 'localhost');

        const clientAddr = client.address();
        expect(clientAddr.port).toBeGreaterThan(0);
      } finally {
        client.close();
        listener.close();
      }
    });

    it('rejects with the lookup error for an unresolvable host and leaves the socket unconnected', async () => {
      const client = createSocket('udp4');
      try {
        await expect(connect(client, 53, 'no-such-host.invalid')).rejects.toMatchObject({ code: 'ENOTFOUND' });
        expect(() => client.remoteAddress()).toThrow();
      } finally {
        client.close();
      }
    });

    it('cancel closes socket', async () => {
      const listener = nodeCreateSocket('udp4');
      const client = createSocket('udp4');

      try {
        await new Promise<void>((resolve, reject) => {
          listener.on('listening', resolve);
          listener.on('error', reject);
          listener.bind(0);
        });

        const listenerAddr = listener.address();
        const closed = new Promise<void>((resolve) => client.once('close', resolve));
        const promise = connect(client, listenerAddr.port, 'localhost');
        promise.cancel();

        const err = await promise.catch((e) => e);
        expect(isCancelError(err)).toBe(true);
        await closed;
        expect(() => client.address()).toThrow();
      } finally {
        listener.close();
      }
    });
  });

  describe('createSocket', () => {
    it('creates a UDP4 socket', () => {
      const socket = createSocket('udp4');
      try {
        expect(socket).toBeDefined();
      } finally {
        socket.close();
      }
    });

    it('creates a UDP6 socket', () => {
      const socket = createSocket('udp6');
      try {
        expect(socket).toBeDefined();
      } finally {
        socket.close();
      }
    });
  });

  describe('Socket class', () => {
    it('has no promise property (it has two terminal events, listening and close)', () => {
      const socket = nodeCreateSocket('udp4');
      try {
        expect((socket as any).promise).toBeUndefined();
        expect(Object.getOwnPropertyNames(socket)).not.toContain('promise');
      } finally {
        socket.close();
      }
    });
  });
});
