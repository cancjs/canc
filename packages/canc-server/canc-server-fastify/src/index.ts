export { CLIENT_DISCONNECTED, HANDLER_TIMEOUT, SERVER_SHUTDOWN } from '../../../_server/reasons';
export type {
  ICancelableHandlerOptions,
  IShutdownOptions,
  IShutdownResult,
  TTimeoutOption,
} from '../../../_server/types';
export type {
  TCancelableHookFn,
  TCancelablePreParsingFn,
  TFastifyPreParsingHook,
  TFastifyRequestHook,
  TFastifyRouteHandler,
} from './handler';
export { cancelableHandler, cancelableHook, cancelablePreParsing, getRequestSignal } from './handler';
export type { ICancelErrorHandlerOptions, ICancelPluginOptions, TCancelErrorHandler } from './plugin';
export { cancelErrorHandler, cancelPlugin } from './plugin';
export { createShutdown } from './shutdown';
