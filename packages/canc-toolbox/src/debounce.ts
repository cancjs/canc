import { CancelablePromise } from '@cancjs/promise';
import { debounceFactory } from '../../_toolbox/debounce';

export const debounce = debounceFactory({ Impl: CancelablePromise as any });
