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
    { input: 'src/child-process/index.ts', base: 'child-process', name: 'canc_node_child_process' },
    { input: 'src/fs/index.ts', base: 'fs/index', name: 'canc_node_fs' },
    { input: 'src/fs/sync.ts', base: 'fs/sync', name: 'canc_node_fs_sync' },
    { input: 'src/fs/register-graceful.ts', base: 'fs/register-graceful', name: 'canc_node_fs_register_graceful' },
    { input: 'src/fs-extra/index.ts', base: 'fs/extra', name: 'canc_node_fs_extra' },
    { input: 'src/timers/index.ts', base: 'timers', name: 'canc_node_timers' },
    { input: 'src/stream/index.ts', base: 'stream', name: 'canc_node_stream' },
    { input: 'src/events/index.ts', base: 'events', name: 'canc_node_events' },
    { input: 'src/dns/index.ts', base: 'dns', name: 'canc_node_dns' },
    { input: 'src/readline/index.ts', base: 'readline', name: 'canc_node_readline' },
    { input: 'src/crypto/index.ts', base: 'crypto', name: 'canc_node_crypto' },
    { input: 'src/zlib/index.ts', base: 'zlib', name: 'canc_node_zlib' },
  ],
  { noUmd: true },
);

for (const config of configs) {
  config.plugins.push(jsonPlugin());
}

export default configs;
