import axios from 'axios';

import { wrapAxios, ICancelableAxiosWrapOptions } from './base';
import type {
	CancelableAxiosInstance,
	CancelableAxiosStatic,
	ICancelContext,
	ICancelableAxiosInterceptors,
	ICancelableAxiosOptions,
	ICancelableInterceptorManager,
	IInterceptorOptions,
} from './types';


// Drop-in for the axios default export: same call forms and statics, cancelable promises.
const cancelableAxios = wrapAxios(axios) as CancelableAxiosStatic;

cancelableAxios.wrap = wrapAxios;

export default cancelableAxios;

export { cancelableAxios, wrapAxios };
export { CancelScope } from './scope';
export type {
	CancelableAxiosInstance,
	CancelableAxiosStatic,
	ICancelContext,
	ICancelableAxiosInterceptors,
	ICancelableAxiosOptions,
	ICancelableAxiosWrapOptions,
	ICancelableInterceptorManager,
	IInterceptorOptions,
};
