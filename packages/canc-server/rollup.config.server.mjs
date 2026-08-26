import { createConfigs } from '../../rollup.config.base.js';

// Server packages are node-only consumers (Express, Fastify, Koa, Hono, raw http): no browser
// global to hang a UMD build off, so two outputs only.
export const createServerConfigs = ({ name }) => createConfigs({ name, formats: ['cjs', 'esm'] });
