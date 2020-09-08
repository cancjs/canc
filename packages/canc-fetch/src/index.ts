import { cancelableFetchFactory } from './base';


const cancelableFetch = cancelableFetchFactory();

const _fetch = fetch;
const _Headers = Headers;
const _Request = Request;
const _Response = Response;
const _AbortController = AbortController;
const _AbortSignal = AbortSignal;

export default cancelableFetch;

export {
	cancelableFetch,
	_fetch as fetch,
	_Headers as Headers,
	_Request as Request,
	_Response as Response,
	_AbortController as AbortController,
	_AbortSignal as AbortSignal
};
