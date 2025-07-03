// Default entry `@cancjs/decorators` = ES / TC39 stage-3 decorators (TS 5+, native).
export { AsyncMethod, BindMethod } from './decorators';

// TS legacy (`experimentalDecorators: true`) — also reachable via the `/legacy` subpath.
export { LegacyAsyncMethod, LegacyBindMethod } from './decorators-legacy';

// Babel legacy (`@babel/plugin-proposal-decorators` legacy mode) — also via `/babel-legacy`.
export { BabelLegacyAsyncMethod, BabelLegacyBindMethod } from './decorators-babel-legacy';
