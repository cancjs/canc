import gracefulFs from 'graceful-fs';

import { getFs, getFsOptions, resetFs } from './registry';

describe('register-graceful side-effect registration', () => {
  afterEach(() => {
    resetFs();
  });

  it('sets getFs() to graceful-fs and retryOpen to true upon import', async () => {
    resetFs();
    expect(getFsOptions().retryOpen).toBe(false);

    await import('./register-graceful');

    expect(getFs()).toBe(gracefulFs);
    expect(getFsOptions().retryOpen).toBe(true);
  });
});
