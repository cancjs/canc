import { createMultiConfigs } from '../../rollup.config.base.mjs';

export default createMultiConfigs([
  { input: 'src/index.ts', base: 'index', name: 'canc_coroutine' },
  { input: 'src/gen.ts', base: 'gen', name: 'canc_coroutine_gen' },
]);
