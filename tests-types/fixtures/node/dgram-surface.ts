import type { DgramSocket } from '@cancjs/node/dgram';
import { createSocket, bind, connect, send } from '@cancjs/node/dgram';
import type { Equal, Expect } from '../common/assert-type';
// @ts-expect-error raw alias removed
import { nodeCreateSocket } from '@cancjs/node/dgram';
// @ts-expect-error type only
new DgramSocket();
type _Socket = Expect<Equal<ReturnType<typeof createSocket>, DgramSocket>>;
void [bind, connect, send];
