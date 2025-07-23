/**
 * demo-signal-interop vanilla entry
 * Teaching: signal ↔ promise interop WITHOUT canc
 */

import {
 signalToPromiseVanilla,
 signalArrayVanilla,
 preAbortedSignalVanilla,
} from './in-vanilla.js';
import {
 promiseToSignalVanilla,
 signalFeedingMultipleAPIsVanilla,
} from './out-vanilla.js';
import {
 composeTimeoutAndSignalVanilla,
 composeMultipleSignalsVanilla,
} from './compose-vanilla.js';
import {
 classifyAbortErrorVanilla,
 suppressAbortVanilla,
 suppressMultipleErrorsVanilla,
} from './classify-vanilla.js';
import {
 withSignalWrapperVanilla,
} from './with-signal-vanilla.js';

async function main() {
 console.log('=== Signal → Promise (vanilla) ===');
 await signalToPromiseVanilla();
 await signalArrayVanilla();
 await preAbortedSignalVanilla();

 console.log('\n=== Promise → Signal (vanilla) ===');
 await promiseToSignalVanilla();
 await signalFeedingMultipleAPIsVanilla();

 console.log('\n=== Composition (vanilla) ===');
 await composeTimeoutAndSignalVanilla();
 await composeMultipleSignalsVanilla();

 console.log('\n=== Classification (vanilla) ===');
 await classifyAbortErrorVanilla();
 await suppressAbortVanilla();
 await suppressMultipleErrorsVanilla();

 console.log('\n=== withSignal wrapper (vanilla) ===');
 await withSignalWrapperVanilla();
}

main().catch(console.error);
