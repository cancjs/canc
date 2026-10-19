import { spawnSync } from 'child_process';
import * as path from 'path';

import { promiseSrc, registerSrc, runChild, unhandledSrc } from '../test/child-process.helper';

jest.setTimeout(30000);

const SKIP_REGISTER = { CANC_FIXTURE_SKIP_REGISTER: '1' };

function runFixture(name: string, env: Record<string, string> = {}) {
  const fixture = path.resolve(__dirname, 'fixtures', name);
  return runChild(`require(${JSON.stringify(fixture)});`, { CANC_FIXTURE_REGISTER_ENTRY: registerSrc, ...env });
}

// Mode flags only take effect on the node command line, which the shared helper pins, so these
// fixtures run under a preloaded transpile hook with the flags chosen per case.
function runFlagged(fixture: string, args: string[], env: Record<string, string> = {}) {
  const res = spawnSync(
    process.execPath,
    [...args, '-r', path.resolve(__dirname, 'fixtures', 'ts-hook.js'), path.resolve(__dirname, 'fixtures', fixture)],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        CANC_FIXTURE_TS: require.resolve('typescript'),
        CANC_FIXTURE_PROMISE: promiseSrc,
        CANC_FIXTURE_UNHANDLED: unhandledSrc,
        ...env,
      },
      encoding: 'utf8',
      timeout: 20000,
    },
  );
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' };
}

describe('@cancjs/unhandled-rejection', () => {
  describe('default handling leaves other listeners in charge', () => {
    it('a listener added after register() receives the real error', () => {
      const res = runFlagged('late-listener.js', ['--unhandled-rejections=throw']);
      expect(res.stdout).toBe('LATE:real failure');
      expect(res.status).toBe(0);
    });

    it('three same-tick rejections all reach an uncaughtException handler', () => {
      const res = runFlagged('same-tick-rejections.js', ['--unhandled-rejections=throw']);
      expect(res.stdout.split(/\r?\n/).filter(Boolean)).toEqual(['CAUGHT:first', 'CAUGHT:second', 'CAUGHT:third']);
      expect(res.status).toBe(0);
    });
  });

  describe('node rejection mode', () => {
    const cases: Array<[string, string, number, RegExp | null]> = [
      ['throw', 'cancel', 0, null],
      ['throw', 'error', 1, /real failure/],
      ['warn', 'cancel', 0, null],
      ['warn', 'error', 0, /real failure/],
      ['warn-with-error-code', 'cancel', 0, null],
      ['warn-with-error-code', 'error', 1, /\[@cancjs\/unhandled-rejection\].*real failure/],
      ['none', 'cancel', 0, null],
      ['none', 'error', 0, /\[@cancjs\/unhandled-rejection\].*real failure/],
      ['strict', 'cancel', 1, /CancelError/],
      ['strict', 'error', 1, /real failure/],
    ];

    it.each(cases)('--unhandled-rejections=%s with a %s reason exits %i', (mode, reason, status, stderr) => {
      const res = runFlagged('reject-by-mode.js', [`--unhandled-rejections=${mode}`], {
        CANC_FIXTURE_REASON: reason,
      });
      expect(res.status).toBe(status);
      if (stderr) {
        expect(res.stderr).toMatch(stderr);
      }
    });

    it('strict warns once at register() that the package is inert', () => {
      const res = runFlagged('reject-by-mode.js', ['--unhandled-rejections=strict'], { CANC_FIXTURE_REASON: 'error' });
      expect(res.stderr.split('inert').length - 1).toBe(1);
    });

    it('reads the mode from NODE_OPTIONS when the command line has no flag', () => {
      const res = runFlagged('reject-by-mode.js', [], {
        NODE_OPTIONS: '--unhandled-rejections=none',
        CANC_FIXTURE_REASON: 'error',
      });
      expect(res.status).toBe(0);
      expect(res.stderr).toMatch(/real failure/);
    });

    it('lets the command line win over NODE_OPTIONS', () => {
      const res = runFlagged('reject-by-mode.js', ['--unhandled-rejections=throw'], {
        NODE_OPTIONS: '--unhandled-rejections=none',
        CANC_FIXTURE_REASON: 'error',
      });
      expect(res.status).toBe(1);
    });
  });

  describe('CancelError the core does not suppress itself', () => {
    it('register() keeps a foreign thenable cancel from crashing the process', () => {
      const res = runFixture('foreign-cancel-register.js');
      expect(res.status).toBe(0);
      expect(res.stderr).toBe('');
    });

    it('the same fixture without register() crashes on the CancelError', () => {
      const res = runFixture('foreign-cancel-register.js', SKIP_REGISTER);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('CancelError');
    });
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

  describe('onUnhandledRejection with a foreign thenable cancel', () => {
    it('is not called and the process exits cleanly', () => {
      const res = runFixture('foreign-cancel-callback.js');
      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain('CALLBACK_FIRED');
    });

    it('the same fixture without register() crashes on the CancelError', () => {
      const res = runFixture('foreign-cancel-callback.js', SKIP_REGISTER);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('CancelError');
    });
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

  describe('one registry per process', () => {
    it('keeps registrations on a global symbol key', () => {
      const { registerNode, unregister } = require('./index');
      const registry = () => (globalThis as any)[Symbol.for('@cancjs/unhandled-rejection:registry')];
      try {
        registerNode();
        expect(registry()).toHaveLength(1);
      } finally {
        unregister();
      }
      expect(registry()).toHaveLength(0);
    });

    it('the side-effect entry plus register with a callback leaves one listener that calls the callback', () => {
      const res = runChild(`
        require(${JSON.stringify(registerSrc)});
        const { register, unregister } = require(${JSON.stringify(unhandledSrc)});
        register({ onUnhandledRejection: (reason) => process.stdout.write('CALLBACK:' + reason.message) });
        process.stdout.write('LISTENERS:' + process.listenerCount('unhandledRejection') + ';');
        Promise.reject(new Error('real failure'));
      `);
      expect(res.stdout).toBe('LISTENERS:1;CALLBACK:real failure');
      expect(res.status).toBe(0);
    });

    it('registering again warns once and the new callback wins', () => {
      const res = runChild(`
        const { register } = require(${JSON.stringify(unhandledSrc)});
        register({ onUnhandledRejection: () => process.stdout.write('FIRST') });
        register({ onUnhandledRejection: (reason) => process.stdout.write('SECOND:' + reason.message) });
        process.stdout.write('LISTENERS:' + process.listenerCount('unhandledRejection') + ';');
        Promise.reject(new Error('real failure'));
      `);
      expect(res.stdout).toBe('LISTENERS:1;SECOND:real failure');
      expect(res.stderr.split('already registered').length - 1).toBe(1);
      expect(res.status).toBe(0);
    });

    it('registering again with different suppression options applies them', () => {
      const res = runChild(`
        const { register } = require(${JSON.stringify(unhandledSrc)});
        register();
        register({ abort: true });
        const err = new Error('aborted');
        err.name = 'AbortError';
        Promise.reject(err);
      `);
      expect(res.status).toBe(0);
    });
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

  it.each([
    ['0', false],
    ['false', false],
    ['  ', false],
    ['1', true],
    ['true', true],
  ])('CANC_UNHANDLED_WARN=%s warns: %s', (value, expected) => {
    const res = runChild(
      `
      const { registerNode } = require(${JSON.stringify(unhandledSrc)});
      registerNode();
      registerNode();
    `,
      { CANC_UNHANDLED_WARN: value },
    );
    expect(res.stderr.includes('[@cancjs/unhandled-rejection]')).toBe(expected);
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

  describe('register side-effect entry with a foreign thenable cancel', () => {
    it('keeps the process alive', () => {
      const res = runFixture('foreign-cancel-side-effect.js');
      expect(res.status).toBe(0);
      expect(res.stderr).toBe('');
    });

    it('the same fixture without the entry crashes on the CancelError', () => {
      const res = runFixture('foreign-cancel-side-effect.js', SKIP_REGISTER);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('CancelError');
    });
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
