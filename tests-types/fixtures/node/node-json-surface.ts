import type { IWriteJsonOptions } from '@cancjs/node/fs/extra';
import { outputJson, outputJsonSync, mkdirp, mkdirs, mkdirpSync, mkdirsSync } from '@cancjs/node/fs/extra';
import type { Equal, Expect } from '../common/assert-type';
// @ts-expect-error redundant alias
import type { IOutputJsonOptions } from '@cancjs/node/fs/extra';

// Node ambient smoke type BufferEncoding is any; real peer lane compiles exact types.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type _Output = Expect<Equal<Parameters<typeof outputJson>[2], IWriteJsonOptions | BufferEncoding | null | undefined>>;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type _Sync = Expect<Equal<Parameters<typeof outputJsonSync>[2], IWriteJsonOptions | BufferEncoding | null | undefined>>;
void [mkdirp, mkdirs, mkdirpSync, mkdirsSync];
