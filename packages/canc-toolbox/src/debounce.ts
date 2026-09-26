import { debounceFactory } from '../../_toolbox/debounce';
import { deps, ICancelableKind } from './deps';

export const debounce = debounceFactory<ICancelableKind>(deps);
