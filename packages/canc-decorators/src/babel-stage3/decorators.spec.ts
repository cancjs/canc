import { AsyncMethod, BindMethod } from '../decorators';
import { runStage3Matrix } from '../decorators.matrix';
import { BabelLegacyAsyncMethod } from '../decorators-babel-legacy';
import { LegacyAsyncMethod } from '../decorators-legacy';

// Proves the Babel 2023-05 stage-3 transform against the shared matrix.
runStage3Matrix({
  AsyncMethod,
  BindMethod,
  LegacyAsyncMethod,
  BabelLegacyAsyncMethod,
  skipBabelFieldOrderingCases: true,
});
