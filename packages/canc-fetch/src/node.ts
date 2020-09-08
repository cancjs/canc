import { AbortController, AbortSignal } from 'abortcontroller-polyfill/dist/abortcontroller';
// import { fetch, Headers, Request, Response } from 'cross-fetch';
import fetch, { Headers, Request, Response } from 'node-fetch';

import { cancelableFetchFactory } from './base';


class Event {
	constructor(public type: string) {}
}

const cancelableFetch = cancelableFetchFactory({ fetch, AbortController, Event });

// exports.default = cancelableFetch;
// exports.cancelableFetch = cancelableFetch;
// exports.fetch = fetch;
// exports.Headers = Headers;
// exports.Request = Request;
// exports.Response = Response;
// exports.AbortController = AbortController;
// exports.AbortSignal = AbortSignal;

export default cancelableFetch;

export {
	cancelableFetch,
	fetch,
	Headers,
	Request,
	Response,
	AbortController,
	AbortSignal
};
