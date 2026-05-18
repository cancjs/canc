import { createMultiConfigs } from '../../rollup.config.base.js';

export default createMultiConfigs(
	[
		{ input: 'src/index.ts', base: 'index', name: 'canc_coroutine' },
		{ input: 'src/iter.ts', base: 'iter', name: 'canc_coroutine_iter' },
	],
);
