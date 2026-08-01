import { CancelablePromise } from '@cancjs/promise';

import { TPromiseCtor } from '../../_toolbox/construct';
import { debounceFactory } from '../../_toolbox/debounce';

export const debounce = debounceFactory({ Impl: CancelablePromise as unknown as TPromiseCtor });
