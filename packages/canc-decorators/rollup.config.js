import { createMultiConfigs } from '../../rollup.config.base.js';

export default createMultiConfigs([
 { input: 'src/index.ts', base: 'index' },
 { input: 'src/legacy.ts', base: 'legacy' },
 { input: 'src/babel-legacy.ts', base: 'babel-legacy' },
], { name: 'canc_decorators' });
