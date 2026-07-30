import { CancelablePromise, isCancelError } from '@cancjs/promise';
import axios from 'axios';

import cancelableAxios, { cancelableAxios as named, wrapAxios } from './index';
import { createStubAdapter } from './stub-adapter.helper';

describe('the default entry', () => {
  it('is the same object under both exports and wraps the axios default export', () => {
    expect(named).toBe(cancelableAxios);
    expect(cancelableAxios.axios).toBe(axios);
    expect(cancelableAxios.wrap).toBe(wrapAxios);
    expect(cancelableAxios.VERSION).toBe(axios.VERSION);
  });

  it('creates cancelable instances', async () => {
    const stub = createStubAdapter();
    const api = cancelableAxios.create({ adapter: stub.adapter });

    const promise = api.get('/issues');
    promise.cancel('stop');

    const error = await promise.catch((reason: unknown) => reason);

    expect(promise).toBeInstanceOf(CancelablePromise);
    expect(isCancelError(error)).toBe(true);
  });
});
