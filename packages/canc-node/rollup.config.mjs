import { createMultiConfigs } from '../../rollup.config.base.js';

// node-only package: every entry imports a node builtin, so none can run in a browser.
// Opt out of UMD outputs package-wide rather than ship a bundle rollup warns is broken.
const jsonPlugin = () => ({
  name: 'json-loader',
  transform(code, id) {
    if (id.endsWith('.json')) {
      return {
        code: `export default ${code};`,
        map: { mappings: '' },
      };
    }
    return null;
  },
});

const configs = createMultiConfigs(
  [
    { input: 'src/index.ts', base: 'index', name: 'canc_node' },
    { input: 'src/fs/index.ts', base: 'fs/index', name: 'canc_node_fs' },
    { input: 'src/fs/sync.ts', base: 'fs/sync', name: 'canc_node_fs_sync' },
    { input: 'src/fs/register-graceful.ts', base: 'fs/register-graceful', name: 'canc_node_fs_register_graceful' },
    { input: 'src/fs-extra/index.ts', base: 'fs/extra', name: 'canc_node_fs_extra' },
  ],
  { noUmd: true },
);

for (const config of configs) {
  config.plugins.push(jsonPlugin());
}

export default configs;
