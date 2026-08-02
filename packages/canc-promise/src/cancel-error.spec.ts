import { CancelError } from './cancel-error';
import { isCancelError } from './helpers';

describe('CancelError', () => {
  it('is ES5 class', () => {
    expect(CancelError).toEqual(expect.any(Function));
    expect(CancelError.toString()).toEqual(expect.not.stringMatching(/^class /));
  });

  it('is custom error', () => {
    const error = new CancelError();

    expect(error).toEqual(expect.any(Error));
    expect(error).toEqual(expect.any(CancelError));
    expect(error.name).toBe('CancelError');
  });

  it('accepts optional message', () => {
    expect(new CancelError().message).toBe('');
    expect(new CancelError('foo').message).toBe('foo');
  });

  // Default-param branch (`reason = ''`): explicit `undefined` argument (arg present, triggers
  // default substitution) vs the omitted-arg case above.
  it('defaults message when reason is explicitly undefined', () => {
    expect(new CancelError(undefined).message).toBe('');
  });

  it('has isBubbled property', () => {
    const error = new CancelError();

    expect(error.isBubbled).toBe(false);
    error.isBubbled = true;
    expect(error.isBubbled).toBe(true);
  });

  // Arbitrary reason preserved via `cause` (native Error cause parity).
  it('accepts a cause option', () => {
    const cause = { some: 'object' };
    const error = new CancelError('boom', { cause });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe('boom');
  });

  it('omits cause when not provided', () => {
    expect('cause' in new CancelError()).toBe(false);
  });

  // Options object provided but without a `cause` key (distinct branch from "no options at
  // all" above and from "cause provided" above).
  it('omits cause when options given without cause', () => {
    expect('cause' in new CancelError('boom', {})).toBe(false);
  });
});

describe('CancelError brand', () => {
  const BRAND = Symbol.for('@cancjs/promise:CancelError');

  it('carries the shared Symbol.for brand', () => {
    expect((new CancelError() as any)[BRAND]).toBe(true);
  });

  it('isCancelError matches by brand, not name', () => {
    expect(isCancelError(new CancelError())).toBe(true);
  });

  // Regression: foreign Error with name 'CancelError' must NOT be matched.
  it('isCancelError rejects a foreign error merely named CancelError', () => {
    const foreign = new Error('impostor');
    foreign.name = 'CancelError';

    expect(isCancelError(foreign)).toBe(false);
  });

  it('isCancelError rejects a plain branded-name lookalike without the brand', () => {
    expect(isCancelError({ name: 'CancelError', message: '' })).toBe(false);
  });

  // The brand lives on the prototype: an instance carries no own brand property, so it survives
  // property enumeration, cloning and serialization without leaking an internal symbol.
  it('carries the brand on the prototype, not on the instance', () => {
    const error = new CancelError();

    expect(Object.getOwnPropertyNames(error)).not.toContain('Symbol(@cancjs/promise:CancelError)');
    expect(Object.getOwnPropertySymbols(error)).not.toContain(BRAND);
    expect(Object.getOwnPropertySymbols(CancelError.prototype)).toContain(BRAND);
    expect((CancelError.prototype as any)[BRAND]).toBe(true);
  });

  it('keeps the prototype brand non-enumerable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(CancelError.prototype, BRAND);

    expect(descriptor).toBeDefined();
    expect(descriptor!.enumerable).toBe(false);
    expect(descriptor!.value).toBe(true);
  });

  // Dual-package hazard: an error minted by a second copy of the package is matched through the
  // registry symbol alone, without sharing a prototype or a constructor.
  it('matches a hand-built error carrying only the registry brand', () => {
    const other = Object.create(null) as Record<symbol, unknown>;
    other[BRAND] = true;

    expect(isCancelError(other)).toBe(true);
    expect(other instanceof CancelError).toBe(false);
  });

  // A subclass that rewrites `name` is still ours, which is why detection cannot key on the name.
  it('matches a subclass that rewrites the name', () => {
    class Weird extends CancelError {
      constructor() {
        super();
        this.name = 'Nope';
      }
    }

    expect(isCancelError(new Weird())).toBe(true);
  });
});
