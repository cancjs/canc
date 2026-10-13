import * as fs from 'fs';
import * as path from 'path';

import { CancelablePromise } from './cancelable-promise';
import { getPromiseImpl, resolvePromiseImpl, setPromiseImpl } from './impl-registry';

// any canc-shaped class passes registration, a subclass keeps identity checks distinct
class RegisteredImpl<T> extends CancelablePromise<T> {}
const Registered = RegisteredImpl as unknown as PromiseConstructor;

describe('impl registry', () => {
  afterEach(() => {
    setPromiseImpl(undefined);
  });

  describe('default fallback', () => {
    it('returns CancelablePromise when nothing is registered', () => {
      expect(getPromiseImpl()).toBe(CancelablePromise);
    });

    it('returns CancelablePromise again after a registration is cleared', () => {
      setPromiseImpl(Registered);
      setPromiseImpl(undefined);

      expect(getPromiseImpl()).toBe(CancelablePromise);
    });
  });

  describe('set/get roundtrip', () => {
    it('returns the registered implementation', () => {
      setPromiseImpl(Registered);

      expect(getPromiseImpl()).toBe(Registered);
    });

    it('overwrites a previous registration', () => {
      class OtherPromise extends CancelablePromise<unknown> {}

      setPromiseImpl(Registered);
      setPromiseImpl(OtherPromise as unknown as PromiseConstructor);

      expect(getPromiseImpl()).toBe(OtherPromise);
    });
  });

  describe('precedence', () => {
    it('prefers per-call options over static, registry, and default', () => {
      class OptionsImpl extends Promise<unknown> {}
      class StaticImpl extends Promise<unknown> {}

      setPromiseImpl(Registered);

      const resolved = resolvePromiseImpl(
        { impl: OptionsImpl as unknown as PromiseConstructor },
        StaticImpl as unknown as PromiseConstructor,
      );

      expect(resolved).toBe(OptionsImpl);
    });

    it('prefers static over registry and default', () => {
      class StaticImpl extends Promise<unknown> {}

      setPromiseImpl(Registered);

      const resolved = resolvePromiseImpl(undefined, StaticImpl as unknown as PromiseConstructor);

      expect(resolved).toBe(StaticImpl);
    });

    it('prefers registry over default', () => {
      setPromiseImpl(Registered);

      expect(resolvePromiseImpl()).toBe(Registered);
      expect(resolvePromiseImpl({}, undefined)).toBe(Registered);
    });

    it('falls back to CancelablePromise when nothing is provided', () => {
      expect(resolvePromiseImpl()).toBe(CancelablePromise);
      expect(resolvePromiseImpl({}, undefined)).toBe(CancelablePromise);
    });
  });

  describe('_util stays stateless (mutable state lives only in this package)', () => {
    it('has no module-scoped mutable bindings in _util', () => {
      const utilPath = path.resolve(__dirname, '../../_util/index.ts');
      const source = fs.readFileSync(utilPath, 'utf8');
      const lines = source.split(/\r?\n/);

      const mutableTopLevel = lines.filter((line) => /^(let|var)\s/.test(line));

      expect(mutableTopLevel).toEqual([]);
    });
  });
});

describe('setPromiseImpl validation', () => {
  afterEach(() => {
    setPromiseImpl(undefined);
  });

  it('rejects a plain object', () => {
    expect(() => setPromiseImpl({} as unknown as PromiseConstructor)).toThrow(TypeError);
    expect(getPromiseImpl()).toBe(CancelablePromise);
  });

  it('rejects the native Promise, which has no cancel', () => {
    expect(() => setPromiseImpl(Promise)).toThrow(TypeError);
    expect(getPromiseImpl()).toBe(CancelablePromise);
  });

  it('rejects a function without a promise prototype', () => {
    expect(() => setPromiseImpl((() => undefined) as unknown as PromiseConstructor)).toThrow(TypeError);
  });

  it('accepts the real implementation', () => {
    setPromiseImpl(CancelablePromise as unknown as PromiseConstructor);

    expect(getPromiseImpl()).toBe(CancelablePromise);
  });

  it('accepts a subclass of the real implementation', () => {
    class Sub<T> extends CancelablePromise<T> {}
    setPromiseImpl(Sub as unknown as PromiseConstructor);

    expect(getPromiseImpl()).toBe(Sub);
  });

  it('still clears with undefined', () => {
    setPromiseImpl(CancelablePromise as unknown as PromiseConstructor);
    setPromiseImpl(undefined);

    expect(getPromiseImpl()).toBe(CancelablePromise);
  });
});
