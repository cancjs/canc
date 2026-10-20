import { lazy, LazyPromise } from './index';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('native LazyPromise.race with lazy inputs', () => {
  it('never starts an unstarted lazy listed after an already settled one', async () => {
    let winnerRuns = 0;
    let loserRuns = 0;
    const winner = lazy<string>((resolve) => {
      winnerRuns++;
      resolve('win');
    });
    const loser = lazy<string>(() => {
      loserRuns++;
    });

    winner.execute();
    await flush();

    await expect(LazyPromise.race([winner, loser])).resolves.toBe('win');
    await flush();
    expect(winnerRuns).toBe(1);
    expect(loserRuns).toBe(0);
    expect(loser.started).toBe(false);
  });
});
