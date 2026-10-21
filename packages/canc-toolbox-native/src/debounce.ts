import { debounceFactory } from '../../_toolbox/debounce';
import { deps, INativeKind } from './deps';

export const debounce = debounceFactory<INativeKind>(deps);
