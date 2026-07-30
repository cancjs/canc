import { AsyncMethod, BindMethod } from './decorators';
import { runStage3Matrix } from './decorators.matrix';
import { BabelLegacyAsyncMethod } from './decorators-babel-legacy';
import { LegacyAsyncMethod } from './decorators-legacy';

// ts-jest lane: native TS 5+ stage-3 decorator emit (tsconfig.stage3.json). Matrix content lives
// in decorators.matrix.ts, shared with the babel lane (babel-stage3/decorators.spec.ts) so both
// compilers are proven against the same assertions.
runStage3Matrix({ AsyncMethod, BindMethod, LegacyAsyncMethod, BabelLegacyAsyncMethod });
