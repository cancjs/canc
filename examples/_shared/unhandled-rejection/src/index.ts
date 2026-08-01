import { isCancelError } from '@cancjs/promise';

// Importing this module installs the listener as a side effect. No install()/uninstall(): a
// canc app wants exactly one guard for its whole process lifetime, so import-once at the entry
// point is the API. A canceled promise rejects with CancelError like any other rejection; an
// abandoned one still fires unhandledRejection unless something is listening for it. This
// listener lets that rejection through when it is a real error and swallows it only when it is
// a CancelError, so app code never needs a per-call `.catch(() => {})`.
process.on('unhandledRejection', (reason) => {
  if (!isCancelError(reason)) throw reason;
});
