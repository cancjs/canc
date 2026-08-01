import { CancelablePromise } from '@cancjs/promise';

import { TPromiseCtor } from '../../_toolbox/construct';
import { throttleFactory } from '../../_toolbox/throttle';

export const throttle = throttleFactory({ Impl: CancelablePromise as unknown as TPromiseCtor });
