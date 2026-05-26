import { isCancelError } from '@cancjs/promise';

// Importing this module installs the listener as a side effect. No install()/uninstall(): a
// canc app wants exactly one guard for its whole page lifetime, so import-once at the entry
// point is the API. A canceled promise rejects with CancelError like any other rejection; an
// abandoned one still fires unhandledrejection unless something is listening for it. This
// listener suppresses that event only when the rejection is a CancelError, so app code never
// needs a per-call `.catch(() => {})`.
window.addEventListener('unhandledrejection', (event) => {
 if (isCancelError(event.reason)) event.preventDefault();
});
