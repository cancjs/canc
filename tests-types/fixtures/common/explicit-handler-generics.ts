import type { Unlisted } from '@cancjs/promise';
import { CancelablePromise as CP } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class SourceError extends Error {
  readonly source = true;
}
class HandlerError extends Error {
  readonly handler = true;
}

declare const source: CP<number, SourceError>;
declare const handler: CP<string, HandlerError>;
declare const optional: ((error: SourceError) => PromiseLike<string>) | undefined;
declare const rejecting: CP<never, HandlerError>;

const fulfilled = source.then<string>(() => Promise.resolve('ok'));
type _fulfilled = Assert<Eq<typeof fulfilled, CP<string, SourceError | Unlisted>>>;
const both = source.then<string, number>(
  () => Promise.resolve('ok'),
  () => Promise.resolve(1),
);
type _both = Assert<Eq<typeof both, CP<string | number, Unlisted>>>;
const absent = source.then<string, number>(() => Promise.resolve('ok'), null);
type _absent = Assert<Eq<typeof absent, CP<string | number, SourceError | Unlisted>>>;
const maybe = source.then<string, string>(() => Promise.resolve('ok'), optional);
type _maybe = Assert<Eq<typeof maybe, CP<string, SourceError | Unlisted>>>;
const rethrow = source.then<string, never>(
  () => Promise.resolve('ok'),
  (e) => {
    throw e;
  },
);
type _rethrow = Assert<Eq<typeof rethrow, CP<string, SourceError | Unlisted>>>;
const recovered = source.catch<string>(() => Promise.resolve('ok'));
type _recovered = Assert<Eq<typeof recovered, CP<number | string, Unlisted>>>;
const caughtMaybe = source.catch<string>(optional);
type _caughtMaybe = Assert<Eq<typeof caughtMaybe, CP<number | string, SourceError | Unlisted>>>;
const caughtNever = source.catch<never>(() => rejecting);
type _caughtNever = Assert<Eq<typeof caughtNever, CP<number, Unlisted>>>;
const typed = source.then(() => handler);
type _typed = Assert<Eq<typeof typed, CP<string, SourceError | HandlerError>>>;
const typedRecovery = source.catch(() => handler);
type _typedRecovery = Assert<Eq<typeof typedRecovery, CP<number | string, HandlerError>>>;
const typedRejection = source.catch(() => rejecting);
type _typedRejection = Assert<Eq<typeof typedRejection, CP<number, HandlerError>>>;
const plain = source.then<string>(() => 'ok');
type _plain = Assert<Eq<typeof plain, CP<string, SourceError>>>;
const untouched = source.catch(null);
type _untouched = Assert<Eq<typeof untouched, CP<number, SourceError>>>;

// @ts-expect-error explicit callback result remains constrained
source.then<number>(() => Promise.resolve('wrong'));
// @ts-expect-error explicit recovery result remains constrained
source.catch<number>(() => Promise.resolve('wrong'));
