import { createMultiConfigs } from '../../rollup.config.base.js';

export default createMultiConfigs(
	[
		{ input: 'src/index.ts', base: 'index', name: 'canc_fetch' },
		{ input: 'src/lazy.ts', base: 'lazy', name: 'canc_fetch_lazy' },
	],
);
