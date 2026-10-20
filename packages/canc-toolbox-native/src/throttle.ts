import { throttleFactory } from '../../_toolbox/throttle';
import { deps, INativeKind } from './deps';

export const throttle = throttleFactory<INativeKind>(deps);
