// Only the cancellation-free base belongs in this barrel. Each flavor is imported by its own path
// so that the native toolbox, which must not depend on the cancelable promise package at all,
// never reaches the cancelable flavor through here.
export {
  isLazyPromise,
  LAZY_PROMISE_BRAND,
  LazyBase,
  TInnerPromise,
  TLazyExecutor,
  TLazyOnCancel,
  TLazyState,
} from './lazy-base';
