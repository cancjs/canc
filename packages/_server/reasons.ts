// Reason strings, not error classes: a cancellation is always a CancelError, and the three server
// triggers differ in what caused them, not in kind.
// Consumers discriminate with isCancelError(err) && !err.timedOut, never on these strings.

/** Reason carried by the cancellation raised when the client goes away before the response ends. */
export const CLIENT_DISCONNECTED = 'client disconnected';

/** Reason carried by the cancellation a graceful shutdown raises on every in-flight request. */
export const SERVER_SHUTDOWN = 'server shutdown';

/** Reason carried by the cancellation a handler deadline raises while the client is still there. */
export const HANDLER_TIMEOUT = 'handler timeout';
