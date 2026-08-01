import { TPromiseCtor } from '../../_toolbox/construct';
import { debounceFactory } from '../../_toolbox/debounce';

const NativePromise = Promise;

export const debounce = debounceFactory({ Impl: NativePromise as unknown as TPromiseCtor });
