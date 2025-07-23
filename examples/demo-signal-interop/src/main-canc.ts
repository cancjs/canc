/**
 * demo-signal-interop canc entry
 * Teaching: signal ↔ promise interop WITH canc
 */

import {
 signalToPromiseCanc,
 signalArrayCanc,
 preAbortedSignalCanc,
} from './in-canc.js';
import {
 promiseToSignalCanc,
 signalFeedingMultipleAPIsCanc,
} from './out-canc.js';
import {
 composeTimeoutAndSignalCanc,
 composeMultipleSignalsCanc,
} from './compose-canc.js';
import {
 classifyAbortErrorCanc,
 suppressAbortCanc,
 suppressMultipleErrorsCanc,
 isAbortErrorCheckCanc,
} from './classify-canc.js';
import {
 withSignalWrapperCanc,
} from './with-signal-canc.js';

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
