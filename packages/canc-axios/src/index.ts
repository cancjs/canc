import axios from 'axios';

import { ICancelableAxiosWrapOptions, wrapAxios } from './base';
import type {
  IAxiosInstanceLike,
  ICancelableAxiosContext,
  ICancelableAxiosInstance,
  ICancelableAxiosOptions,
  ICancelableAxiosStatic,
  ICancelableInterceptorManager,
  ICancelableAxiosInterceptors,
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
  ICancelableAxiosOptions,
  ICancelableAxiosStatic,
  ICancelableAxiosWrapOptions,
  ICancelableInterceptorManager,
  ICancelableAxiosInterceptors,
  IInterceptorOptions,
};
