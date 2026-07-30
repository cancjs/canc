import { CancelablePromise } from '@cancjs/promise';

import { throttleFactory } from '../../_toolbox/throttle';

export const throttle = throttleFactory({ Impl: CancelablePromise as any });
