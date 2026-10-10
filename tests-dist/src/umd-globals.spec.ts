import fs from 'fs';
import path from 'path';
import vm from 'vm';

const packagesDir = path.resolve(__dirname, '../../packages');

if (!fs.existsSync(path.join(packagesDir, 'canc-promise/dist/index.umd.js'))) {
  throw new Error('Run "npm run build" before "npm run test:dist"');
}

const VARIANTS = ['umd.js', 'umd.min.js'];

// each bundle is evaluated as a classic script, the way a script tag would
function createScope(pkgs: string[], variant: string, preamble = ''): vm.Context {
  const scope = vm.createContext({ setTimeout, clearTimeout, console, AbortController });

  vm.runInContext(preamble, scope);

  for (const entry of pkgs) {
    const [pkg, base = 'index'] = entry.split('/');
    const file = path.join(packagesDir, `canc-${pkg}/dist/${base}.${variant}`);

    vm.runInContext(fs.readFileSync(file, 'utf8'), scope, { filename: file });
  }

  return scope;
}

function run<T>(scope: vm.Context, code: string): Promise<T> {
  return Promise.resolve(vm.runInContext(code, scope));
}

describe.each(VARIANTS)('umd builds loaded together (%s)', (variant) => {
  it('runs a coroutine on top of the promise global', async () => {
    const scope = createScope(['promise', 'coroutine'], variant);

    await expect(run(scope, 'canc_coroutine.cancAsync(function* () { return 1; })()')).resolves.toBe(1);
  });

  it('cancels a coroutine with a cancel error', async () => {
    const scope = createScope(['promise', 'coroutine'], variant);

    await expect(
      run(
        scope,
        `(function () {
          var task = canc_coroutine.cancAsync(function* () { yield new canc_promise.default(function () {}); })();
          task.cancel();
          return task.then(function () { return 'resolved'; }, canc_promise.isCancelError);
        })()`,
      ),
    ).resolves.toBe(true);
  });

  it('wraps a method with the decorators global', async () => {
    const scope = createScope(['promise', 'coroutine', 'decorators'], variant);

    await expect(
      run(
        scope,
        `(function () {
          var context = { kind: 'method', name: 'inc', addInitializer: function () {} };
          var inc = canc_decorators.AsyncMethod(function* (n) { return (yield n) + 1; }, context);
          return inc.call({}, 41);
        })()`,
      ),
    ).resolves.toBe(42);
  });

  it('rejects a canceled toolbox delay with a cancel error', async () => {
    const scope = createScope(['promise', 'toolbox'], variant);

    await expect(
      run(
        scope,
        `(function () {
          var pending = canc_toolbox.delay(60000);
          pending.cancel();
          return pending.then(function () { return 'resolved'; }, canc_promise.isCancelError);
        })()`,
      ),
    ).resolves.toBe(true);
  });

  describe('axios', () => {
    const axiosStub = `
      globalThis.axios = (function () {
        function request(config) {
          return new Promise(function (resolve, reject) {
            if (config.url === '/hang') {
              config.signal.addEventListener('abort', function () { reject(new Error('aborted')); });
              return;
            }
            resolve({ status: 200, data: { url: config.url }, config: config });
          });
        }
        var instance = function (config) { return request(config); };
        instance.request = request;
        instance.get = function (url, config) { return request(Object.assign({}, config, { url: url })); };
        instance.defaults = {};
        instance.interceptors = {
          request: { use: function () {}, eject: function () {} },
          response: { use: function () {}, eject: function () {} },
        };
        return instance;
      })();
    `;

    it('resolves a request made through the axios global', async () => {
      const scope = createScope(['promise', 'toolbox', 'axios'], variant, axiosStub);

      await expect(
        run(scope, 'canc_axios.default.get("/ok").then(function (res) { return res.data.url; })'),
      ).resolves.toBe('/ok');
    });

    it('turns a canceled request into a cancel error', async () => {
      const scope = createScope(['promise', 'toolbox', 'axios'], variant, axiosStub);

      await expect(
        run(
          scope,
          `(function () {
            var pending = canc_axios.default.get('/hang');
            pending.cancel();
            return pending.then(function () { return 'resolved'; }, canc_promise.isCancelError);
          })()`,
        ),
      ).resolves.toBe(true);
    });
  });

  describe('fetch', () => {
    const fetchStub = `globalThis.fetch = function (url, init) {
          return new Promise(function (resolve, reject) {
            if (url === '/hang') {
              init.signal.addEventListener('abort', function () { reject(init.signal.reason); });
              return;
            }
            resolve({ status: 200, url: url });
          });
        };`;

    it('resolves a request made through the fetch global', async () => {
      const scope = createScope(['promise', 'fetch'], variant, fetchStub);

      await expect(run(scope, 'canc_fetch.default("/ok").then(function (res) { return res.status; })')).resolves.toBe(
        200,
      );
    });

    it('turns a canceled request into a cancel error', async () => {
      const scope = createScope(['promise', 'fetch'], variant, fetchStub);

      await expect(
        run(
          scope,
          `(function () {
            var pending = canc_fetch.default('/hang');
            pending.cancel();
            return pending.then(function () { return 'resolved'; }, canc_promise.isCancelError);
          })()`,
        ),
      ).resolves.toBe(true);
    });
  });

  it('ignores cancel errors in the unhandled rejection handler', async () => {
    const scope = createScope(['promise', 'unhandled-rejection'], variant);

    await expect(
      run(
        scope,
        `(function () {
          var listeners = {};
          globalThis.addEventListener = function (type, fn) { listeners[type] = fn; };
          globalThis.removeEventListener = function () {};
          var reported = [];
          canc_unhandled_rejection.registerBrowser({ onUnhandledRejection: function (reason) { reported.push(reason); } });

          var cancelPrevented = false;
          listeners.unhandledrejection({ reason: new canc_promise.CancelError(), preventDefault: function () { cancelPrevented = true; } });

          var failure = new Error('boom');
          listeners.unhandledrejection({ reason: failure, preventDefault: function () {} });
          canc_unhandled_rejection.unregister();

          return cancelPrevented && reported.length === 1 && reported[0] === failure;
        })()`,
      ),
    ).resolves.toBe(true);
  });
});

interface IEntryCase {
  entry: string;
  prerequisites: string[];
  global: string;
  call: string;
  expected: unknown;
}

const ENTRY_CASES: IEntryCase[] = [
  {
    entry: 'coroutine/gen',
    prerequisites: ['promise'],
    global: 'canc_coroutine_gen',
    call: 'canc_coroutine_gen.async(function* () { yield 1; return 3; })().next().then(JSON.stringify)',
    expected: '{"value":1,"done":false}',
  },
  {
    entry: 'decorators/legacy',
    prerequisites: ['promise', 'coroutine'],
    global: 'canc_decorators_legacy',
    call: `(function () {
      var descriptor = { value: function* (n) { return (yield n) + 1; } };
      var wrapped = canc_decorators_legacy.AsyncMethod({}, 'inc', descriptor) || descriptor;
      return wrapped.value.call({}, 41);
    })()`,
    expected: 42,
  },
  {
    entry: 'decorators/babel-legacy',
    prerequisites: ['promise', 'coroutine'],
    global: 'canc_decorators_babel_legacy',
    call: `(function () {
      var descriptor = { value: function* (n) { return (yield n) + 1; } };
      var wrapped = canc_decorators_babel_legacy.AsyncMethod({}, 'inc', descriptor) || descriptor;
      return wrapped.value.call({}, 41);
    })()`,
    expected: 42,
  },
  {
    entry: 'toolbox/async-iter',
    prerequisites: ['promise'],
    global: 'canc_toolbox_async_iter',
    call: `canc_toolbox_async_iter.pipe(
      canc_toolbox_async_iter.from([1, 2, 3]),
      canc_toolbox_async_iter.toArray(),
    ).then(JSON.stringify)`,
    expected: '[1,2,3]',
  },
  {
    entry: 'toolbox-native',
    prerequisites: [],
    global: 'canc_toolbox_native',
    call: 'canc_toolbox_native.delay("ok", 1)',
    expected: 'ok',
  },
];

describe.each(VARIANTS)('umd entry points beyond the main bundles (%s)', (variant) => {
  it.each(ENTRY_CASES)(
    'loads $entry and runs a real call',
    async ({ entry, prerequisites, global, call, expected }) => {
      const scope = createScope([...prerequisites, entry], variant);

      const ownKeys = vm.runInContext(`typeof ${global} === 'object' ? Object.keys(${global}).length : -1`, scope);

      expect({ [global]: ownKeys > 0 }).toEqual({ [global]: true });
      await expect(run(scope, call)).resolves.toBe(expected);
    },
  );

  it('loads unhandled-rejection/register and installs a browser listener', () => {
    const scope = createScope(
      ['promise', 'unhandled-rejection/register'],
      variant,
      `globalThis.addedTypes = [];
       globalThis.addEventListener = function (type) { addedTypes.push(type); };
       globalThis.removeEventListener = function () {};`,
    );

    expect(vm.runInContext('addedTypes.join(",")', scope)).toContain('unhandledrejection');
  });
});
