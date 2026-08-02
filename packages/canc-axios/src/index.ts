import axios from 'axios';

import { ICancelableAxiosWrapOptions, wrapAxios } from './base';
import type {
  IAxiosInstanceLike,
  ICancelableAxiosContext,
  ICancelableAxiosInstance,
  ICancelableAxiosInterceptors,
  ICancelableAxiosOptions,
  ICancelableAxiosStatic,
  ICancelableInterceptorManager,
  IInterceptorOptions,
} from './types';

// Drop-in for the axios default export: same call forms and statics, cancelable promises.
const cancelableAxios = wrapAxios(axios) as ICancelableAxiosStatic;

cancelableAxios.wrap = wrapAxios;

export default cancelableAxios;

export { cancelableAxios, wrapAxios };
export { CancelScope } from './scope';
export type {
  IAxiosInstanceLike,
  ICancelableAxiosContext,
  ICancelableAxiosInstance,
  ICancelableAxiosInterceptors,
  ICancelableAxiosOptions,
  ICancelableAxiosStatic,
  ICancelableAxiosWrapOptions,
  ICancelableInterceptorManager,
  IInterceptorOptions,
};
