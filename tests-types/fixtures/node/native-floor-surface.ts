import * as crypto from '@cancjs/node/crypto';
import * as zlib from '@cancjs/node/zlib';
import * as nativeCrypto from 'node:crypto';
import * as nativeZlib from 'node:zlib';

const createHash: typeof nativeCrypto.createHash = crypto.createHash;
const createGzip: typeof nativeZlib.createGzip = zlib.createGzip;
void [createHash, createGzip];
