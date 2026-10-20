import { followInput, isCountedInput } from './input';

describe('isCountedInput', () => {
  it('treats a value whose counting members throw on read as uncounted', () => {
    const hostile = {
      get _subscribe(): never {
        throw new Error('read');
      },
      get _retainRef(): never {
        throw new Error('read');
      },
      then(): void {
        /* never settles */
      },
    };

    expect(isCountedInput(hostile)).toBe(false);
    expect(() => followInput(hostile, jest.fn(), jest.fn())).not.toThrow();
  });
});
