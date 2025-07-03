import { createMultiConfigs } from '../../rollup.config.base.js';

export default createMultiConfigs(
	[
		{ input: 'src/index.ts', base: 'index', name: 'canc_toolbox' },
		{ input: 'src/native.ts', base: 'native', name: 'canc_toolbox_native' },
	],
);
