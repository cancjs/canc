// preloaded with -r so flags stay free per case, paths come from the environment
const Module = require('module');
const fs = require('fs');

const ts = require(process.env.CANC_FIXTURE_TS);

Module._extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      downlevelIteration: true,
      useDefineForClassFields: false,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const origRequire = Module.prototype.require;
Module.prototype.require = function (request) {
  if (request === '@cancjs/promise') {
    return origRequire.call(this, process.env.CANC_FIXTURE_PROMISE);
  }
  if (request === '@cancjs/unhandled-rejection') {
    return origRequire.call(this, process.env.CANC_FIXTURE_UNHANDLED);
  }
  return origRequire.call(this, request);
};
