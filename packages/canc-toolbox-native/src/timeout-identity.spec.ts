import { timeout, TimeoutError } from './index';

describe('TimeoutError identity (native)', () => {
  it('rejects with an error that passes instanceof against its own exported class', async () => {
    const p = new Promise(() => {}); // never resolves
    const err = await timeout(p, 10).catch((e) => e);

    expect(err).toBeInstanceOf(TimeoutError);
  });
});
