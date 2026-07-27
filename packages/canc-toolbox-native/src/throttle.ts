import { throttleFactory } from '../../_toolbox/throttle';

const NativePromise = Promise;

export const throttle = throttleFactory({ Impl: NativePromise as any });
