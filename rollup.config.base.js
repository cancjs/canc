import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import rollupCommonjs from '@rollup/plugin-commonjs';
import rollupTerser from '@rollup/plugin-terser';
import rollupTypescript from '@rollup/plugin-typescript';
import rollupExternals from 'rollup-plugin-node-externals';
import rollupFilesize from 'rollup-plugin-filesize';
// import rollupProgress from 'rollup-plugin-progress';
import rollupResolve from '@rollup/plugin-node-resolve';


const isVerbose = (process.argv.slice(2).indexOf('--silent') === -1);

const trace = () => ({
	transform: (_content, id) => {
		if (isVerbose) {
			console.log(id);
		}
	}
});

// rootDir has to cover packages/_util (relative-imported shared internal code,
// invariant 8 — inlined per package, not a real dependency) or TS throws TS6059.
// That widens declarationDir's mirrored output to dist/types/packages/<pkg>/src/*
// plus a stray packages/_util/*.d.ts. Flatten to dist/types/*.d.ts after emit and
// drop the _util declarations — they're implementation detail, never re-exported
// from a package's public entry (verified: index.d.ts has no _util references).
const flattenDeclarations = () => ({
	name: 'flatten-declarations',
	writeBundle() {
		const pkgName = path.basename(process.cwd());
		const nestedSrcDir = path.join('dist/types/packages', pkgName, 'src');

		if (!fs.existsSync(nestedSrcDir)) {
			return;
		}

		for (const entry of fs.readdirSync(nestedSrcDir)) {
			fs.renameSync(path.join(nestedSrcDir, entry), path.join('dist/types', entry));
		}
		fs.rmSync('dist/types/packages', { recursive: true, force: true });
	}
});

// TS floor = 4.2. downlevel-dts rewrites the handful of newer d.ts syntax
// forms it knows about (asserts predicates <3.7, template literal types <4.1,
// paired get/set <3.6...) into a dist/types-ts4.2/ variant. It does NOT know
// about `Awaited<T>` (lib-defined starting TS 4.5, per its own transform list —
// verified empty in node_modules/downlevel-dts/index.js) so a follow-up patch
// script injects a local shadow type alias into any file still referencing the
// bare name post-downlevel (scripts/patch-awaited.js — see comment there).
// CLI (not the internal `main` export) — that's undocumented API, stick to the
// public contract.
const TS_FLOOR = '4.2';
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const downlevelTypes = () => ({
	name: 'downlevel-types',
	writeBundle() {
		const typesDir = 'dist/types';

		if (!fs.existsSync(typesDir)) {
			return;
		}

		const variantDir = `dist/types-ts${TS_FLOOR}`;

		fs.rmSync(variantDir, { recursive: true, force: true });
		execFileSync(
			process.execPath,
			[path.join(repoRoot, 'node_modules/downlevel-dts/index.js'), typesDir, variantDir, `--to=${TS_FLOOR}`],
			{ stdio: isVerbose ? 'inherit' : 'ignore' }
		);
		execFileSync(
			process.execPath,
			[path.join(repoRoot, 'scripts/patch-awaited.js'), variantDir],
			{ stdio: isVerbose ? 'inherit' : 'ignore' }
		);
	}
});

// Declaration emit runs once (on the cjs build) and lands in dist/types;
// other outputs reuse the same tsconfig w/ declaration emit disabled so
// tsc doesn't run redundantly / race to write the same .d.ts files.
const createTypescriptPlugin = (emitDeclaration) => rollupTypescript({
	tsconfig: './tsconfig.prod.json',
	outDir: 'dist',
	...(emitDeclaration
		? { declaration: true, declarationDir: 'dist/types' }
		: { declaration: false, declarationMap: false }),
	noEmitOnError: true
});

// An entry descriptor. `input` is the source module; `base` is the output basename under dist/
// (dist/<base>.cjs etc). Declaration emit runs only for the entry that requests it.
const defaultEntry = { input: 'src/index.ts', base: 'index' };

const createCommonConfig = (emitDeclaration, entry) => ({
	input: entry.input,
	plugins: [
		isVerbose && trace(),
		// isVerbose && rollupProgress(),
		rollupExternals(),
		rollupResolve(),
		createTypescriptPlugin(emitDeclaration),
		rollupCommonjs()
	]
});

const createCjsConfig = (entry, emitDeclaration) => {
	const config = createCommonConfig(emitDeclaration, entry);

	config.output = {
		file: `dist/${entry.base}.cjs`,
		format: 'cjs',
		exports: 'named',
		sourcemap: true
	};
	// Declaration flatten/downlevel run once, on the declaration-emitting entry, to avoid two
	// tsc passes racing to write the same dist/types files.
	if (emitDeclaration) {
		config.plugins.push(flattenDeclarations(), downlevelTypes());
	}
	config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

	return config;
};

const createEsmConfig = (entry) => {
	const config = createCommonConfig(false, entry);

	config.output = {
		file: `dist/${entry.base}.mjs`,
		format: 'es',
		sourcemap: true
	};
	config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

	return config;
};

const createUmdConfig = (entry, options) => {
	const config = createCommonConfig(false, entry);

	config.output = {
		file: `dist/${entry.base}.umd.js`,
		format: 'umd',
		name: options.name,
		exports: 'named',
		sourcemap: true
	};
	config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

	return config;
};

const createUmdMinConfig = (entry, options) => {
	const config = createCommonConfig(false, entry);

	config.output = {
		file: `dist/${entry.base}.umd.min.js`,
		format: 'umd',
		name: options.name,
		exports: 'named',
		sourcemap: true
	};
	config.plugins.push(
		rollupTerser({
			output: {
				comments: (_node, comment) => {
					const text = comment.value;
					const isMultiline = (comment.type === 'comment2');

					return isMultiline && /@preserve/i.test(text);
				}
			}
		}),
		isVerbose && rollupFilesize({ showMinifiedSize: false })
	);

	return config;
};

// Build all four output formats for one entry. The primary entry (declaration emit on) drives the
// .d.ts pass; additional twin entries reuse the same tsconfig with declaration emit disabled.
const createEntryConfigs = (entry, options, emitDeclaration) => [
	createCjsConfig(entry, emitDeclaration),
	createEsmConfig(entry),
	createUmdConfig(entry, options),
	createUmdMinConfig(entry, options)
];

export const createConfigs = (options = { name: 'LibraryName' }) =>
	createEntryConfigs(defaultEntry, options, true);

// Multi-entry variant for packages that ship twin entry points (e.g. a `-native` flavor). The
// first entry emits declarations; the rest reuse the same type output. Each entry needs a distinct
// `base` and may set its own UMD global `name`.
export const createMultiConfigs = (entries, options = { name: 'LibraryName' }) =>
	entries.flatMap((entry, index) =>
		createEntryConfigs(entry, { name: entry.name || options.name }, index === 0));

export default null;
