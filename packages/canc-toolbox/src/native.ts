// Native twin entry: every utility is prebound to the platform's native Promise, so nothing here
// is cancelable and the pluggable-impl surface (factories, options.impl, deferCancelable) is
// intentionally omitted. This is the reduced export set for consumers who only want the timing and
// retry helpers on plain promises. Use the main '@cancjs/toolbox' entry for cancellation support.
import { PromiseImpl } from '@cancjs/promise';
import { delayFactory } from './delay';
import { deferFactory } from './defer';
import { timeoutFactory } from './timeout';
import { waitForFactory } from './wait-for';
import { minDelayFactory } from './min-delay';
import { retryFactory } from './retry';
import { promisifyFactory, promisifyAllFactory } from './promisify';

const NativePromise = Promise as unknown as PromiseImpl;

export const delay = delayFactory(NativePromise);
export const defer = deferFactory(NativePromise);
export const timeout = timeoutFactory(NativePromise);
export const waitFor = waitForFactory(NativePromise);
export const minDelay = minDelayFactory(NativePromise);
export const retry = retryFactory(NativePromise);

// Native twins: a native Promise cannot be canceled, so the short-circuit cancel path is an inert
// detach only and the handleCancel/signal-injection hooks never fire.
export const promisify = promisifyFactory(NativePromise);
export const promisifyAll = promisifyAllFactory(NativePromise);

export { TimeoutError, isTimeoutError } from './timeout';
