import type { ICancelable } from '@cancjs/promise';


export const isObject = (value: any): value is Object => !!value && typeof value === 'object';

export const isFunction = (value: any): value is Function => typeof value === 'function';

export const isThenable = (obj: any): obj is PromiseLike<any> => isObject(obj) && isFunction(obj.then);

export const isCancelable = (obj: any): obj is ICancelable => isThenable(obj) && isFunction((obj as Partial<ICancelable>).cancel);
