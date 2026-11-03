// Runs the server suites against the lowest framework versions the adapters' peer ranges admit.
//
// The frameworks are installed with --no-save and no lockfile into a scratch prefix.
// A jest config wrapper resolves them from there, so the workspace install stays untouched.
// Everything else (ts-jest, the adapters' sources) is the workspace's own.
//
//   node scripts/install-server-framework-floor.js                  install into the default prefix
//   node scripts/install-server-framework-floor.js --run            install, then run the suites
//   node scripts/install-server-framework-floor.js --run --latest   run them on the workspace
//   node scripts/install-server-framework-floor.js --print-command  print the npm command and stop
//
// Options: --prefix <dir>, --only <express,koa,fastify,hono>, --no-install (reuse the prefix).
// --set <package@version> installs another version than the floor, to find the lowest passing one.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'packages', 'canc-server');

// the lowest version of each framework the peer ranges allow
const FLOOR = {
  express: [['express', '4.18.0']],
  fastify: [['fastify', '5.0.0']],
  hono: [
    ['hono', '4.8.0'],
    ['@hono/node-server', '1.9.0'],
  ],
  koa: [['koa', '2.13.0']],
};

// requests that name one of the frameworks, or a subpath of it
const FRAMEWORK_REQUEST = /^(express|koa|fastify|hono|@hono\/node-server)(\/|$)/;

function parseArgs(argv) {
  const options = {
    install: true,
    latest: false,
    only: Object.keys(FLOOR),
    printCommand: false,
    run: false,
    versions: {},
  };
  let prefix = path.join(os.tmpdir(), 'canc', 'server-framework-floor');

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--prefix') {
      prefix = path.resolve(argv[(index += 1)]);
    } else if (arg === '--only') {
      options.only = argv[(index += 1)].split(',');
    } else if (arg === '--set') {
      const spec = argv[(index += 1)];
      const at = spec.lastIndexOf('@');

      options.versions[spec.slice(0, at)] = spec.slice(at + 1);
    } else if (arg === '--run') {
      options.run = true;
    } else if (arg === '--latest') {
      options.latest = true;
    } else if (arg === '--no-install') {
      options.install = false;
    } else if (arg === '--print-command') {
      options.printCommand = true;
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
  }

  for (const name of options.only) {
    if (!FLOOR[name]) {
      throw new Error(`unknown framework ${name}, expected one of ${Object.keys(FLOOR).join(', ')}`);
    }
  }

  options.prefix = prefix;

  return options;
}

function resolveNpmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  try {
    return require.resolve('npm/bin/npm-cli.js');
  } catch {
    return path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  }
}

function installArgs(options) {
  const specs = options.only.flatMap((name) =>
    FLOOR[name].map(([pkg, version]) => `${pkg}@${options.versions[pkg] ?? version}`),
  );

  return [
    'install',
    '--no-save',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--prefix',
    options.prefix,
    ...specs,
  ];
}

function install(options) {
  fs.mkdirSync(options.prefix, { recursive: true });

  // an empty manifest keeps npm from walking up and treating a parent project as the install target
  const manifest = path.join(options.prefix, 'package.json');

  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(manifest, JSON.stringify({ name: 'server-framework-floor', private: true, version: '0.0.0' }));
  }

  const result = spawnSync(process.execPath, [resolveNpmCli(), ...installArgs(options)], { stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(`npm install failed with status ${result.status}`);
  }
}

// the target's own jest config, with the frameworks resolved from the floor prefix
// only a request from outside the prefix is redirected, so nested dependencies resolve as laid out
function wrapConfig(options, configPath) {
  const slug = path.basename(path.dirname(configPath));
  const wrapper = path.join(options.prefix, `jest.${slug}.config.js`);
  const resolver = path.join(options.prefix, 'jest.resolver.js');
  // the resolver sees real paths, which on windows are not the short form a temp dir is reported in
  const prefix = fs.realpathSync.native(options.prefix).split(path.sep).join('/').toLowerCase();

  const resolverLines = [
    `const prefix = ${JSON.stringify(prefix)};`,
    `const frameworks = ${FRAMEWORK_REQUEST.toString()};`,
    'module.exports = (request, options) => {',
    "  const from = options.basedir.split(require('path').sep).join('/').toLowerCase();",
    '',
    '  if (frameworks.test(request) && !from.startsWith(prefix)) {',
    '    try {',
    '      return options.defaultResolver(request, { ...options, basedir: prefix });',
    '    } catch {',
    '      // not installed in the prefix, so the workspace copy stands',
    '    }',
    '  }',
    '',
    '  return options.defaultResolver(request, options);',
    '};',
    '',
  ];
  const wrapperLines = [
    `const base = require(${JSON.stringify(configPath)});`,
    'module.exports = {',
    '  ...base,',
    `  resolver: ${JSON.stringify(resolver)},`,
    `  rootDir: ${JSON.stringify(path.dirname(configPath))},`,
    '};',
    '',
  ];

  fs.writeFileSync(resolver, resolverLines.join(os.EOL));
  fs.writeFileSync(wrapper, wrapperLines.join(os.EOL));

  return wrapper;
}

function targets(options) {
  const members = {
    express: 'canc-server-express',
    fastify: 'canc-server-fastify',
    hono: 'canc-server-hono',
    koa: 'canc-server-koa',
  };
  const list = [
    {
      args: ['--testPathPatterns', 'parity', '-t', `parity (${options.only.join('|')})`],
      dir: SERVER_DIR,
      name: 'parity',
    },
  ];

  for (const name of options.only) {
    list.push({ args: [], dir: path.join(SERVER_DIR, members[name]), name });
  }

  if (options.only.length === Object.keys(FLOOR).length) {
    list.push({ args: [], dir: path.join(SERVER_DIR, 'canc-server-node'), name: 'node' });
  }

  return list;
}

function runSuites(options) {
  const jest = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
  const failed = [];

  for (const target of targets(options)) {
    const configPath = path.join(target.dir, 'jest.config.js');
    const config = options.latest ? configPath : wrapConfig(options, configPath);
    const args = [jest, '-c', config, '-w', '2', '--no-coverage', ...target.args];

    console.log(`\n== ${target.name} (${options.latest ? 'latest' : 'floor'}) ==`);

    const result = spawnSync(process.execPath, args, {
      cwd: target.dir,
      env: { ...process.env, NODE_OPTIONS: '--no-deprecation' },
      stdio: 'inherit',
    });

    console.log(`== ${target.name}: ${result.status === 0 ? 'green' : 'red'} ==`);

    if (result.status !== 0) {
      failed.push(target.name);
    }
  }

  return failed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.printCommand) {
    console.log(['npm', ...installArgs(options)].join(' '));

    return;
  }

  if (options.install && !options.latest) {
    install(options);
  }

  if (!options.run) {
    return;
  }

  const failed = runSuites(options);

  if (failed.length > 0) {
    console.error(`\nred: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main();
