import './node-ambient';
/**
 * Smoke fixture verifying that every subpath of `@cancjs/node` resolves
 * under older TypeScript compilers (TS <4.7 with moduleResolution: node).
 *
 * Deliberately runtime-dead: nothing executes. Exists purely to make tsc
 * resolve the shipped declaration files via package.json typesVersions.
 */
import type {} from '@cancjs/node';
import type {} from '@cancjs/node/fs';
import type {} from '@cancjs/node/fs/sync';
import type {} from '@cancjs/node/fs/register-graceful';
import type {} from '@cancjs/node/fs/extra';
import type {} from '@cancjs/node/child-process';
import type {} from '@cancjs/node/timers';
import type {} from '@cancjs/node/stream';
import type {} from '@cancjs/node/events';
import type {} from '@cancjs/node/dns';
import type {} from '@cancjs/node/readline';
import type {} from '@cancjs/node/crypto';
import type {} from '@cancjs/node/zlib';
import type {} from '@cancjs/node/worker-threads';
import type {} from '@cancjs/node/dgram';

export {};
