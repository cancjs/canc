import { debounceFactory } from '../../_toolbox/debounce';

const NativePromise = Promise;

export const debounce = debounceFactory({ Impl: NativePromise as any });
