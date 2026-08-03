import { createMultiConfigs } from '../../rollup.config.base.js';

export default createMultiConfigs([
  { input: 'src/index.ts', base: 'index', name: 'canc_unhandled_rejection' },
  { input: 'src/register.ts', base: 'register', name: 'canc_unhandled_rejection_register' },
]);
