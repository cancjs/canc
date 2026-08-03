import { execFileSync } from 'child_process';
import * as path from 'path';

jest.setTimeout(30000);

describe('@cancjs/unhandled-rejection register entry', () => {
  it('side-effect entry auto-registers handler', () => {
    const registerSrc = path.resolve(__dirname, 'register.ts');
    const promiseSrc = path.resolve(__dirname, '../../canc-promise/src/index.ts');
    const unhandledSrc = path.resolve(__dirname, 'index.ts');

    const hook = `
      const ts = require(${JSON.stringify(require.resolve('typescript'))});
      const Module = require('module');
      const fs = require('fs');

      Module._extensions['.ts'] = function (module, filename) {
        const source = fs.readFileSync(filename, 'utf8');
        const out = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
            esModuleInterop: true,
            downlevelIteration: true,
            useDefineForClassFields: false
          },
          fileName: filename
        });
        module._compile(out.outputText, filename);
      };

      const _origRequire = Module.prototype.require;
      Module.prototype.require = function(request) {
        if (request === '@cancjs/promise') {
          return _origRequire.call(this, ${JSON.stringify(promiseSrc)});
        }
        if (request === '@cancjs/unhandled-rejection') {
          return _origRequire.call(this, ${JSON.stringify(unhandledSrc)});
        }
        return _origRequire.call(this, request);
      };
    `;

    const fullCode = `
      ${hook}
      require(${JSON.stringify(registerSrc)});
      const { CancelablePromise } = require(${JSON.stringify(promiseSrc)});
      const p = new CancelablePromise(() => {});
      p.cancel();
    `;

    let status = 0;
    try {
      execFileSync(process.execPath, ['-e', fullCode], {
        cwd: __dirname,
        encoding: 'utf8',
      });
    } catch (err: any) {
      status = err.status ?? 1;
    }

    expect(status).toBe(0);
  });
});
