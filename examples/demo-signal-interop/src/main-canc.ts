import '@cancjs/unhandled-rejection/register';

/**
 * demo-signal-interop canc entry
 * Teaching: signal ↔ promise interop WITH canc
 */
import {
  classifyAbortErrorCanc,
  isAbortErrorCheckCanc,
  suppressAbortCanc,
  suppressMultipleErrorsCanc,
} from './classify-canc.js';
import { composeMultipleSignalsCanc, composeTimeoutAndSignalCanc } from './compose-canc.js';
import { preAbortedSignalCanc, signalArrayCanc, signalToPromiseCanc } from './in-canc.js';
import { promiseToSignalCanc, signalFeedingMultipleAPIsCanc } from './out-canc.js';
import { withSignalWrapperCanc } from './with-signal-canc.js';

async function main() {
  console.log('=== Signal → Promise (canc) ===');
  await signalToPromiseCanc();
  await signalArrayCanc();
  await preAbortedSignalCanc();

  console.log('\n=== Promise → Signal (canc) ===');
  await promiseToSignalCanc();
  await signalFeedingMultipleAPIsCanc();

  console.log('\n=== Composition (canc) ===');
  await composeTimeoutAndSignalCanc();
  await composeMultipleSignalsCanc();

  console.log('\n=== Classification (canc) ===');
  await classifyAbortErrorCanc();
  await suppressAbortCanc();
  await suppressMultipleErrorsCanc();
  await isAbortErrorCheckCanc();

  console.log('\n=== withSignal wrapper (canc) ===');
  await withSignalWrapperCanc();
}

main().catch(console.error);
