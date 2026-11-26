import type { CancelError, Failing, FailureOf, Unlisted } from '@cancjs/promise';
import { CancelablePromise as CP, FAILURE } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

class ExternalError extends Error {
  readonly external = true;
}

interface ExternalThenable extends PromiseLike<number> {
  readonly [FAILURE]?: Exclude<ExternalError | CancelError, CancelError>;
}

declare const external: ExternalThenable;
declare const structural: PromiseLike<number> & Failing<ExternalError>;
declare const native: PromiseLike<number>;

type _key = Assert<Eq<typeof FAILURE, '_cancFailure'>>;
type _external = Assert<Eq<FailureOf<ExternalThenable>, ExternalError>>;
const resolved = CP.resolve(external);
type _resolved = Assert<Eq<typeof resolved, CP<number, ExternalError>>>;
const structuralResolved = CP.resolve(structural);
type _structural = Assert<Eq<typeof structuralResolved, CP<number, ExternalError>>>;
const nativeResolved = CP.resolve(native);
type _native = Assert<Eq<typeof nativeResolved, CP<number, Unlisted>>>;
