import { createMultiConfigs } from '../../rollup.config.base.js';

export default createMultiConfigs([
  { input: 'src/index.ts', base: 'index', name: 'canc_decorators' },
  { input: 'src/legacy.ts', base: 'legacy', name: 'canc_decorators_legacy' },
  { input: 'src/babel-legacy.ts', base: 'babel-legacy', name: 'canc_decorators_babel_legacy' },
]);
