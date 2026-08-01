import { TPromiseCtor } from '../../_toolbox/construct';
import { throttleFactory } from '../../_toolbox/throttle';

const NativePromise = Promise;

export const throttle = throttleFactory({ Impl: NativePromise as unknown as TPromiseCtor });
