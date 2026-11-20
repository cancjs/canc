import { createMultiConfigs } from '../../rollup.config.base.mjs';

const configs = createMultiConfigs([
  { input: 'src/index.ts', base: 'index', name: 'canc_unhandled_rejection' },
  { input: 'src/register.ts', base: 'register', name: 'canc_unhandled_rejection_register' },
]);

// register builds import the package instead of inlining a second copy
// UMD reaches it through the index global, so the index script loads first
const selfImport = '@cancjs/unhandled-rejection';

for (const config of configs) {
  if (config.input !== 'src/register.ts') {
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
