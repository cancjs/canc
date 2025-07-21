// placeholder, see example task
import { loadProfile } from './profile';

async function main(): Promise<void> {
 const controller = new AbortController();
 const pending = loadProfile('u1', 50, controller.signal);

 // The caller loses interest. With a plain promise the only lever is an AbortController
 // threaded all the way down, plus a name check to tell abort apart from real failures.
 controller.abort();

 try {
 await pending;
 console.log('vanilla: profile loaded');
 } catch (error) {
 if (error instanceof DOMException && error.name === 'AbortError') {
 console.log('vanilla: aborted');
 } else {
 throw error;
 }
 }
}

main();
