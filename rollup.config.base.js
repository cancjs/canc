import fs from 'fs';
import path from 'path';
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

const createCommonConfig = (emitDeclaration) => ({
	input: 'src/index.ts',
	plugins: [
		isVerbose && trace(),
		// isVerbose && rollupProgress(),
		rollupExternals(),
		rollupResolve(),
		createTypescriptPlugin(emitDeclaration),
		rollupCommonjs()
	]
});

const createCjsConfig = () => {
	const config = createCommonConfig(true);

	config.output = {
		file: 'dist/index.cjs',
		format: 'cjs',
		exports: 'named',
		sourcemap: true
	};
	config.plugins.push(
		flattenDeclarations(),
		isVerbose && rollupFilesize({ showMinifiedSize: false })
	);

	return config;
};

const createEsmConfig = () => {
	const config = createCommonConfig(false);

	config.output = {
		file: 'dist/index.mjs',
		format: 'es',
		sourcemap: true
	};
	config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

	return config;
};

const createUmdConfig = (options) => {
	const config = createCommonConfig(false);

	config.output = {
		file: 'dist/index.umd.js',
		format: 'umd',
		name: options.name,
		exports: 'named',
		sourcemap: true
	};
	config.plugins.push(isVerbose && rollupFilesize({ showMinifiedSize: false }));

	return config;
};

const createUmdMinConfig = (options) => {
	const config = createCommonConfig(false);

	config.output = {
		file: 'dist/index.umd.min.js',
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

export const createConfigs = (options = { name: 'LibraryName' }) => [
	createCjsConfig(),
	createEsmConfig(),
	createUmdConfig(options),
	createUmdMinConfig(options)
];

export default null;
