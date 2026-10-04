/**
 * Canonical cancel(reason) strings for canc framework example helpers (react/vue/angular).
 * Not an error taxonomy: CancelError stays the type check (isCancelError). These constants are
 * the detail a consumer branches on to tell WHY a chain was canceled.
 */
export const CANCEL_REASON_UNMOUNTED = 'unmounted';
export const CANCEL_REASON_SUPERSEDED = 'superseded';
export const CANCEL_REASON_DEPS_CHANGED = 'deps-changed';
