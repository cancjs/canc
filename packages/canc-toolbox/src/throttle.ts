import { throttleFactory } from '../../_toolbox/throttle';
import { deps, ICancelableKind } from './deps';

export const throttle = throttleFactory<ICancelableKind>(deps);
