// axios.all reads each member's failure set the way CancelablePromise.all does
import axios from '@cancjs/axios';
import type { CancelablePromise, FailureOf, Unlisted } from '@cancjs/promise';
import type { AxiosError } from 'axios';

import type { Equal, Expect } from './assert-type';

declare const native: Promise<number>;
declare const closed: CancelablePromise<number, never>;

const requests = axios.all([axios.get('/a'), axios.get('/b')]);
type _requests = Expect<Equal<FailureOf<typeof requests>, AxiosError<any, any> | Unlisted>>;
const mixed = axios.all([native, 1]);
type _mixed = Expect<Equal<FailureOf<typeof mixed>, Unlisted>>;
const values = axios.all([1, 2]);
type _values = Expect<Equal<FailureOf<typeof values>, never>>;
const closedOnly = axios.all([closed]);
type _closedOnly = Expect<Equal<FailureOf<typeof closedOnly>, never>>;
