import { createMultiConfigs } from '../../rollup.config.base.mjs';

export default createMultiConfigs([
  { input: 'src/index.ts', base: 'index', name: 'canc_toolbox' },
  { input: 'src/async-iter.ts', base: 'async-iter', name: 'canc_toolbox_async_iter' },
]);
