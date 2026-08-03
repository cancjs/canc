import { execFileSync } from 'child_process';
import * as path from 'path';

jest.setTimeout(30000);

const unhandledSrc = path.resolve(__dirname, 'index.ts');
const promiseSrc = path.resolve(__dirname, '../../canc-promise/src/index.ts');

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

function runChild(
  code: string,
  envOverrides: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const fullCode = `
    ${hook}
    ${code}
  `;

  try {
    const stdout = execFileSync(process.execPath, ['--unhandled-rejections=throw', '-e', fullCode], {
      cwd: __dirname,
      env: {
        ...process.env,
        ...envOverrides,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: stdout || '', stderr: '' };
  } catch (err: any) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
    };
  }
}

describe('@cancjs/unhandled-rejection', () => {
  it('register() filters CancelError in node child process', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      const { CancelablePromise } = require(${JSON.stringify(promiseSrc)});
      register();
      const p = new CancelablePromise(() => {});
      p.cancel();
    `);
    expect(res.status).toBe(0);
  });

  it('register() lets real errors through in node child', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      register();
      Promise.reject(new Error('real failure'));
    `);
    expect(res.status).not.toBe(0);
  });

  it('unregister() restores default behavior', () => {
    const res = runChild(`
      const { register, unregister } = require(${JSON.stringify(unhandledSrc)});
      register();
      unregister();
      process.on('unhandledRejection', () => process.exit(42));
      Promise.reject(new Error('unregistered'));
    `);
    expect(res.status).toBe(42);
  });

  it('onUnhandledRejection callback fires for non-cancel', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      register({
        onUnhandledRejection: (reason) => {
          process.stdout.write('CALLBACK:' + reason.message);
        }
      });
      Promise.reject(new Error('real failure'));
    `);
    expect(res.stdout).toContain('CALLBACK:real failure');
  });

  it('onUnhandledRejection NOT called for CancelError', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      const { CancelablePromise } = require(${JSON.stringify(promiseSrc)});
      register({
        onUnhandledRejection: () => {
          process.stdout.write('SHOULD_NOT_FIRE');
        }
      });
      const p = new CancelablePromise(() => {});
      p.cancel();
    `);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('SHOULD_NOT_FIRE');
  });

  it('Double register warns', () => {
    const { registerNode, unregister, setWarn } = require('./index');
    setWarn(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      registerNode();
      registerNode();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'));
    } finally {
      warnSpy.mockRestore();
      unregister();
    }
  });

  it('setWarn(false) suppresses warnings', () => {
    const { registerNode, unregister, setWarn } = require('./index');
    setWarn(false);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      registerNode();
      registerNode();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      setWarn(true);
      unregister();
    }
  });

  it('CANC_UNHANDLED_WARN=0 suppresses warnings', () => {
    const res = runChild(
      `
      const { registerNode } = require(${JSON.stringify(unhandledSrc)});
      registerNode();
      registerNode();
    `,
      { CANC_UNHANDLED_WARN: '0' },
    );
    expect(res.stderr).not.toContain('[@cancjs/unhandled-rejection]');
  });

  it('registerNode in browser-like env warns', () => {
    const { registerNode, unregister, setWarn } = require('./index');
    setWarn(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const origOn = process.on;
    try {
      (process as any).on = undefined;
      registerNode();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to register handler'));
    } finally {
      process.on = origOn;
      warnSpy.mockRestore();
      unregister();
    }
  });

  it('register side-effect entry', () => {
    const registerSrc = path.resolve(__dirname, 'register.ts');
    const res = runChild(`
      require(${JSON.stringify(registerSrc)});
      const { CancelablePromise } = require(${JSON.stringify(promiseSrc)});
      const p = new CancelablePromise(() => {});
      p.cancel();
    `);
    expect(res.status).toBe(0);
  });

  it('register({ abort: true }) also suppresses AbortError', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      register({ abort: true });
      const err = new Error('aborted');
      err.name = 'AbortError';
      Promise.reject(err);
    `);
    expect(res.status).toBe(0);
  });

  it('register({ timeout: true }) also suppresses TimeoutError', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      const { TimeoutError } = require(${JSON.stringify(promiseSrc)});
      register({ timeout: true });
      Promise.reject(new TimeoutError());
    `);
    expect(res.status).toBe(0);
  });

  it('register() without abort/timeout does NOT suppress AbortError', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      register();
      const err = new Error('aborted');
      err.name = 'AbortError';
      Promise.reject(err);
    `);
    expect(res.status).not.toBe(0);
  });

  it('register({ abort: true, timeout: true }) suppresses both', () => {
    const res = runChild(`
      const { register } = require(${JSON.stringify(unhandledSrc)});
      const { TimeoutError } = require(${JSON.stringify(promiseSrc)});
      register({ abort: true, timeout: true });
      const err = new Error('aborted');
      err.name = 'AbortError';
      Promise.reject(err);
      Promise.reject(new TimeoutError());
    `);
    expect(res.status).toBe(0);
  });
});
