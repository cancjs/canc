import { createMultiConfigs } from '../../rollup.config.base.js';

// node-only package: every entry imports a node builtin, so none can run in a browser.
// Opt out of UMD outputs package-wide rather than ship a bundle rollup warns is broken.
export default createMultiConfigs([{ input: 'src/index.ts', base: 'index', name: 'canc_node' }], { noUmd: true });
