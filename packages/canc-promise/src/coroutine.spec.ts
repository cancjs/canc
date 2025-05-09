import { cancAsync, cancAwait } from './coroutine';

describe('cancAsync', () => {
  it('', () => {
    return (async () => {
      const a = await cancAsync(function* () {
        const wtf = this.wtf;
        console.log('Hello');
        const p: Promise<number> = new Promise((resolve) => setTimeout(() => resolve(1), 1000));
        const n = yield* cancAwait(p);
        yield* cancAwait(null);
        console.log(n);
        console.log('World');
        return /*yield* cancAwait*/(Promise.resolve(3));
      }, {wtf: 1})();

      console.log({ a })
    })();
  })
});