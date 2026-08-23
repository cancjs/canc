import { AsyncMethod, BindMethod } from './decorators';
import { runStage3Matrix } from './decorators.matrix';
import { BabelLegacyAsyncMethod } from './decorators-babel-legacy';
import { LegacyAsyncMethod } from './decorators-legacy';

// Proves native TS 5+ stage-3 emit against the shared matrix.
runStage3Matrix({ AsyncMethod, BindMethod, LegacyAsyncMethod, BabelLegacyAsyncMethod });
