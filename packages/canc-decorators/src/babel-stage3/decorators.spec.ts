import { AsyncMethod, BindMethod } from '../decorators';
import { LegacyAsyncMethod } from '../decorators-legacy';
import { BabelLegacyAsyncMethod } from '../decorators-babel-legacy';
import { runStage3Matrix } from '../decorators.matrix';

// Babel lane: `@babel/plugin-proposal-decorators` "2023-05" emit (packages/canc-decorators/babel.config.js),
// proving the vite/esbuild-adjacent stage-3 decorator transform against the same matrix the
// ts-jest lane (../decorators.spec.ts) runs under native TS 5+ emit.
runStage3Matrix({
 AsyncMethod,
 BindMethod,
 LegacyAsyncMethod,
 BabelLegacyAsyncMethod,
 skipBabelFieldOrderingCases: true,
});
