import axios from 'axios';

import { ICancelableAxiosWrapOptions, wrapAxios } from './base';
import type {
  AxiosInstanceLike,
  CancelableAxiosInstance,
  CancelableAxiosStatic,
  ICancelableAxiosInterceptors,
  ICancelableAxiosOptions,
  ICancelableInterceptorManager,
  ICancelContext,
  IInterceptorOptions,
} from './types';

// Drop-in for the axios default export: same call forms and statics, cancelable promises.
const cancelableAxios = wrapAxios(axios) as CancelableAxiosStatic;

cancelableAxios.wrap = wrapAxios;

export default cancelableAxios;

export { cancelableAxios, wrapAxios };
export { CancelScope } from './scope';
export type {
  AxiosInstanceLike,
  CancelableAxiosInstance,
  CancelableAxiosStatic,
  ICancelableAxiosInterceptors,
  ICancelableAxiosOptions,
  ICancelableAxiosWrapOptions,
  ICancelableInterceptorManager,
  ICancelContext,
  IInterceptorOptions,
};
