import { AsyncMethod, BindMethod } from '../decorators';
import { runStage3Matrix } from '../decorators.matrix';
import { BabelLegacyAsyncMethod } from '../decorators-babel-legacy';
import { LegacyAsyncMethod } from '../decorators-legacy';

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
