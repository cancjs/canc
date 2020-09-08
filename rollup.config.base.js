import rollupCommonjs from '@rollup/plugin-commonjs';
import { eslint as rollupEslint } from 'rollup-plugin-eslint';
import rollupExternals from 'rollup-plugin-node-externals';
import rollupFilesize from 'rollup-plugin-filesize';
// import rollupProgress from 'rollup-plugin-progress';
import rollupResolve from '@rollup/plugin-node-resolve';
import rollupSourceMaps from 'rollup-plugin-sourcemaps';
import rollupTsTreeshaking from 'rollup-plugin-ts-treeshaking';
import rollupTypescript from 'rollup-plugin-typescript2';
import { terser as rollupTerser } from 'rollup-plugin-terser';


const isVerbose = (process.argv.slice(2).indexOf('--silent') === -1);

const trace = () => ({
	transform: (_content, id) => {
		if (isVerbose) {
			console.log(id);
		}
	}
});

const createUmdCommonConfig = (options = { name: 'LibraryName' }) => ({
	input: 'src/index.ts',
	output: {
		file: '',
		format: 'commonjs',
		name: options.name,
		sourcemap: true
	},
	plugins: [
		isVerbose && trace(),
		// isVerbose && rollupProgress(),
		rollupEslint({
			parserOptions: {
				project: './tsconfig.prod.json'
			}
		}),
		rollupTypescript({ tsconfig: './tsconfig.prod.json' }),
		rollupExternals(),
		rollupResolve(),
		rollupTsTreeshaking(),
		rollupCommonjs()
	]
});

const createUmdDevConfig = (options) => {
	const config = createUmdCommonConfig(options);

	config.output.file = 'dist/index.js';
	config.plugins.push(
		rollupSourceMaps(),
		isVerbose && rollupFilesize({ showMinifiedSize: false })
	);

	return config;
};

const createUmdProdConfig = (options) => {
	const config = createUmdCommonConfig(options);

	config.output.file = 'dist/index.min.js';
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
		rollupSourceMaps(),
		isVerbose && rollupFilesize({ showMinifiedSize: false })
	);

	return config;
};

export const createConfigs = (options) => [
	createUmdDevConfig(options),
	createUmdProdConfig(options)
];

export default null;
