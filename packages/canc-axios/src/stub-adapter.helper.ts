// A minimal axios adapter for the specs: it records the configs it received, honors `config.signal`,
// and stays pending until told to respond, so a cancel always lands on an in-flight request.

export interface IStubAdapterOptions {
  /** Respond as soon as the request starts. Off by default, so cancel tests are deterministic. */
  auto?: boolean;
  status?: number;
  data?: any;
  /** Reject an aborted request the way a hand-rolled adapter usually does. Axios's own adapters
   * throw a CanceledError instead; both paths are covered. */
  abortError?: 'abort' | 'canceled';
}

export interface IStubAdapter {
  adapter: (config: any) => Promise<any>;
  /** Configs the adapter was called with, in order. */
  calls: any[];
  /** True once an in-flight request saw its signal abort. */
  aborted: boolean;
  respond: (body?: any) => void;
  fail: (status: number) => void;
}

export const createStubAdapter = (options: IStubAdapterOptions = {}): IStubAdapter => {
  const stub: IStubAdapter = {
    calls: [],
    aborted: false,
    adapter: null as any,
    respond: function () {},
    fail: function () {},
  };

  stub.adapter = function (config: any) {
    stub.calls.push(config);

    return new Promise(function (resolve, reject) {
      const respond = function (body?: any) {
        resolve({
          data:
            body === undefined ?
              options.data === undefined ?
                { ok: true }
              : options.data
            : body,
          status: options.status === undefined ? 200 : options.status,
          statusText: 'OK',
          headers: {},
          config: config,
          request: {},
        });
      };

      const fail = function (status: number) {
        const error = Object.assign(new Error('Request failed with status code ' + status), {
          isAxiosError: true,
          code: 'ERR_BAD_RESPONSE',
          config: config,
          response: { status: status, data: options.data, headers: {}, config: config },
        });

        reject(error);
      };

      stub.respond = respond;
      stub.fail = fail;

      const onAbort = function () {
        stub.aborted = true;

        if (options.abortError === 'canceled') {
          const canceled = Object.assign(new Error('canceled'), {
            name: 'CanceledError',
            __CANCEL__: true,
            code: 'ERR_CANCELED',
          });

          reject(canceled);
          return;
        }

        const aborted = new Error('The operation was aborted');
        aborted.name = 'AbortError';
        reject(aborted);
      };

      const signal = config.signal;

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener('abort', onAbort);
      }

      if (options.auto) {
        setTimeout(respond, 0);
      }
    });
  };

  return stub;
};
