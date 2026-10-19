import { createMultiConfigs } from '../../rollup.config.base.mjs';

const configs = createMultiConfigs([
  { input: 'src/index.ts', base: 'index', name: 'canc_unhandled_rejection' },
  { input: 'src/register.ts', base: 'register', name: 'canc_unhandled_rejection_register' },
]);

// cjs and es keep the self-import external to share one registry, UMD inlines it to load standalone
const selfImport = '@cancjs/unhandled-rejection';

for (const config of configs) {
  const format = config.output.format;
  if (format !== 'cjs' && format !== 'es') {
    continue;
  }
  const orig = config.external;
  if (Array.isArray(orig)) {
    config.external = [...orig, selfImport];
  } else if (typeof orig === 'function') {
    config.external = (id, ...args) => id === selfImport || orig(id, ...args);
  } else if (orig) {
    config.external = [orig, selfImport];
  } else {
    config.external = [selfImport];
  }
}

export default configs;
