import * as fs from 'fs';
import * as path from 'path';
import { CancelablePromise } from './cancelable-promise';
import {
	getPromiseImpl,
	resolvePromiseImpl,
	setPromiseImpl
} from './impl-registry';

describe('impl registry', () => {
	afterEach(() => {
		setPromiseImpl(undefined);
	});

	describe('default fallback', () => {
		it('returns CancelablePromise when nothing is registered', () => {
			expect(getPromiseImpl()).toBe(CancelablePromise);
		});

		it('returns CancelablePromise again after a registration is cleared', () => {
			setPromiseImpl(Promise);
			setPromiseImpl(undefined);

			expect(getPromiseImpl()).toBe(CancelablePromise);
		});
	});

	describe('set/get roundtrip', () => {
		it('returns the registered implementation', () => {
			setPromiseImpl(Promise);

			expect(getPromiseImpl()).toBe(Promise);
		});

		it('overwrites a previous registration', () => {
			class OtherPromise extends Promise<unknown> {}

			setPromiseImpl(Promise);
			setPromiseImpl(OtherPromise as unknown as PromiseConstructor);

			expect(getPromiseImpl()).toBe(OtherPromise);
		});
	});

	describe('precedence', () => {
		it('prefers per-call options over static, registry, and default', () => {
			class OptionsImpl extends Promise<unknown> {}
			class StaticImpl extends Promise<unknown> {}

			setPromiseImpl(Promise);

			const resolved = resolvePromiseImpl(
				{ impl: OptionsImpl as unknown as PromiseConstructor },
				StaticImpl as unknown as PromiseConstructor
			);

			expect(resolved).toBe(OptionsImpl);
		});

		it('prefers static over registry and default', () => {
			class StaticImpl extends Promise<unknown> {}

			setPromiseImpl(Promise);

			const resolved = resolvePromiseImpl(undefined, StaticImpl as unknown as PromiseConstructor);

			expect(resolved).toBe(StaticImpl);
		});

		it('prefers registry over default', () => {
			setPromiseImpl(Promise);

			expect(resolvePromiseImpl()).toBe(Promise);
			expect(resolvePromiseImpl({}, undefined)).toBe(Promise);
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

			const mutableTopLevel = lines.filter(line => /^(let|var)\s/.test(line));

			expect(mutableTopLevel).toEqual([]);
		});
	});
});
