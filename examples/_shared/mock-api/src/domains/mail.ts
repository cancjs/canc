import { AbortSignalLike, MockApi } from '../core';

export interface Mail {
  to: string;
  subject: string;
}

export interface MailApi {
  send(to: string, signal?: AbortSignalLike): Promise<void>;
}

export function createMailApi(api: MockApi): MailApi {
  return {
    send: (to, signal) =>
      api.respond(
        'mail.send',
        { to },
        () => {
          return undefined;
        },
        signal,
      ),
  };
}
