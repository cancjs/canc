import dgram from 'node:dgram';
import { Resolver as NodeResolver } from 'node:dns/promises';
import { once } from 'node:events';

import { Resolver } from './resolver';

const invalid = [null, undefined, 42, {}, []];

async function rejectInvalid(owner: Resolver): Promise<void> {
  for (const value of invalid) {
    await expect(owner.resolve4(value as string)).rejects.toMatchObject({ code: 'ERR_INVALID_ARG_TYPE' });
  }
}

describe('resolver synchronous error ownership', () => {
  it('releases every private resolver after invalid input', async () => {
    const cancel = jest.spyOn(NodeResolver.prototype, 'cancel');
    const owner = new Resolver();
    const fresh = new Resolver();
    try {
      await rejectInvalid(owner);
      expect(cancel).toHaveBeenCalledTimes(0);
      owner.cancel();
      expect(cancel).toHaveBeenCalledTimes(1);
      cancel.mockClear();
      fresh.cancel();
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      owner.cancel();
      fresh.cancel();
      cancel.mockRestore();
    }
  });

  it('does not remove a valid in-flight sibling when an invalid query throws', async () => {
    const socket = dgram.createSocket('udp4');
    const owner = new Resolver({ timeout: 5000, tries: 1 });
    const cancel = jest.spyOn(NodeResolver.prototype, 'cancel');
    try {
      socket.bind(0, '127.0.0.1');
      await once(socket, 'listening');
      owner.setServers([`127.0.0.1:${socket.address().port}`]);
      const packet = once(socket, 'message');
      const sibling = owner.resolve4('sibling.example.test');
      const outcome = sibling.catch((error: unknown) => error);
      await packet;
      await rejectInvalid(owner);
      expect(cancel).toHaveBeenCalledTimes(0);
      owner.cancel();
      expect(await outcome).toMatchObject({ code: 'ECANCELLED' });
      expect(cancel).toHaveBeenCalledTimes(2);
    } finally {
      owner.cancel();
      cancel.mockRestore();
      socket.close();
    }
  });
});
