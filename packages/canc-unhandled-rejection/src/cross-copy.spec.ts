import { promiseSrc, runChild, unhandledSrc } from '../test/child-process.helper';

jest.setTimeout(30000);

const HANDLER_BRAND = Symbol.for('@cancjs/unhandled-rejection:handler');

type Copy = typeof import('./index');

// a fresh module evaluation, like a second installed copy
function loadCopy(): Copy {
  let copy!: Copy;
  jest.isolateModules(() => {
    copy = require('./index');
  });
  return copy;
}

function brandedListeners(): unknown[] {
  return process.listeners('unhandledRejection').filter((listener) => (listener as any)[HANDLER_BRAND]);
}

// two evaluations of the source in one child, a loaded first
const twoCopies = `
  const src = ${JSON.stringify(unhandledSrc)};
  const a = require(src);
  delete require.cache[require.resolve(src)];
  const b = require(src);
  if (a === b) { throw new Error('expected two module copies'); }
`;

describe('@cancjs/unhandled-rejection across copies', () => {
  describe('the process handler brand', () => {
    it('registering writes no registry on globalThis', () => {
      const { registerNode, unregister } = require('./index');
      try {
        registerNode();
        expect((globalThis as any)[Symbol.for('@cancjs/unhandled-rejection:registry')]).toBeUndefined();
      } finally {
        unregister();
      }
    });

    it('brands the process listener and unregister() removes it', () => {
      const { registerNode, unregister } = require('./index');
      try {
        registerNode();
        expect(brandedListeners()).toHaveLength(1);
      } finally {
        unregister();
      }
      expect(brandedListeners()).toHaveLength(0);
    });
  });

  it('one copy keeps both of its own process registrations when the targets differ', () => {
    const copy = loadCopy();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      copy.registerBun();
      copy.registerNode();
      expect(brandedListeners()).toHaveLength(2);
    } finally {
      copy.unregister();
      warnSpy.mockRestore();
    }
  });

  describe('two copies in one process', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('the second copy replaces the first copy handler and warns once', () => {
      const a = loadCopy();
      const b = loadCopy();
      try {
        a.setWarn(true);
        b.setWarn(true);
        a.registerNode();
        const first = brandedListeners();
        b.registerNode();
        expect(brandedListeners()).toHaveLength(1);
        expect(brandedListeners()[0]).not.toBe(first[0]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('another copy'));
      } finally {
        b.unregister();
        a.unregister();
      }
    });

    it('alternating copies warn once and the latest callback owns the rejection', () => {
      const a = loadCopy();
      const b = loadCopy();
      try {
        a.registerNode({ onUnhandledRejection: () => {} });
        expect(brandedListeners()).toHaveLength(1);
        b.registerNode({ onUnhandledRejection: () => {} });
        expect(brandedListeners()).toHaveLength(1);
        warnSpy.mockClear();
        a.registerNode({ onUnhandledRejection: () => {} });
        expect(brandedListeners()).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          '[@cancjs/unhandled-rejection] Handler already registered by another copy of this package. Replacing it with the new options.',
        );
      } finally {
        b.unregister();
        a.unregister();
      }
      expect(brandedListeners()).toHaveLength(0);

      const delivered = runChild(`
        ${twoCopies}
        a.registerNode({ warn: false, onUnhandledRejection: (r) => process.stdout.write('A1:' + r.message) });
        b.registerNode({ warn: false, onUnhandledRejection: (r) => process.stdout.write('B:' + r.message) });
        a.registerNode({ warn: false, onUnhandledRejection: (r) => process.stdout.write('A2:' + r.message) });
        process.stdout.write('BRANDED:' + process.listeners('unhandledRejection').filter(
          (fn) => fn[Symbol.for('@cancjs/unhandled-rejection:handler')]
        ).length + ';');
        Promise.reject(new Error('real failure'));
      `);
      expect(delivered.status).toBe(0);
      expect(delivered.stdout).toBe('BRANDED:1;A2:real failure');

      const opaque = runChild(`
        ${twoCopies}
        const originalListeners = process.listeners.bind(process);
        process.listeners = (event) => originalListeners(event).map((fn) => (...args) => fn(...args));
        const warnings = [];
        console.warn = (msg) => warnings.push(msg);
        a.registerNode();
        a.registerNode();
        process.stdout.write('WARNINGS:' + warnings.length + ';' + warnings[0]);
        a.unregister();
      `);
      expect(opaque.status).toBe(0);
      expect(opaque.stdout).toBe(
        'WARNINGS:1;[@cancjs/unhandled-rejection] Handler already registered for type "node". Replacing it with the new options.',
      );
    });

    it('unregister() from the second copy removes the handler the first copy installed', () => {
      const a = loadCopy();
      const b = loadCopy();
      try {
        a.registerNode();
        expect(brandedListeners()).toHaveLength(1);
        b.unregister();
        expect(brandedListeners()).toHaveLength(0);
      } finally {
        a.unregister();
      }
    });

    it('a non-canc listener is left alone by register() and unregister()', () => {
      const a = loadCopy();
      const b = loadCopy();
      const foreign = (): void => {};
      process.on('unhandledRejection', foreign);
      try {
        a.registerNode();
        b.registerNode();
        b.unregister();
        expect(process.listeners('unhandledRejection')).toContain(foreign);
      } finally {
        process.removeListener('unhandledRejection', foreign);
        a.unregister();
      }
    });

    it('both copies register and only the later callback fires for a real rejection', () => {
      const res = runChild(`
        ${twoCopies}
        a.register({ onUnhandledRejection: (r) => process.stdout.write('A:' + r.message + ';') });
        b.register({ onUnhandledRejection: (r) => process.stdout.write('B:' + r.message + ';') });
        process.stdout.write('LISTENERS:' + process.listenerCount('unhandledRejection') + ';');
        Promise.reject(new Error('real failure'));
      `);
      expect(res.stdout).toBe('LISTENERS:1;B:real failure;');
      expect(res.status).toBe(0);
    });

    it('a real rejection with no callback and no other listener still crashes', () => {
      const res = runChild(`
        ${twoCopies}
        a.register();
        b.register();
        Promise.reject(new Error('real failure'));
      `);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('real failure');
    });

    it('a canceled rejection is suppressed whichever copy registered last', () => {
      const res = runChild(`
        ${twoCopies}
        const { CancelablePromise } = require(${JSON.stringify(promiseSrc)});
        a.register();
        b.register({ warn: false });
        new CancelablePromise(() => {}).cancel();
      `);
      expect(res.stderr).toBe('');
      expect(res.status).toBe(0);
    });
  });

  describe('who owns the outcome', () => {
    it('a listener that is not canc defers the crash to itself', () => {
      const res = runChild(`
        const { register } = require(${JSON.stringify(unhandledSrc)});
        register();
        process.on('unhandledRejection', (r) => process.stdout.write('OTHER:' + r.message));
        Promise.reject(new Error('real failure'));
      `);
      expect(res.stdout).toBe('OTHER:real failure');
      expect(res.status).toBe(0);
    });

    it('two canc handlers of different targets alone still crash on a real error', () => {
      const res = runChild(`
        const { registerBun, registerNode } = require(${JSON.stringify(unhandledSrc)});
        console.warn = () => {};
        registerBun();
        registerNode();
        Promise.reject(new Error('real failure'));
      `);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('real failure');
    });
  });

  describe('a process that reports wrapped listeners', () => {
    const wrapped = `
      const original = process.listeners.bind(process);
      process.listeners = (event) => original(event).map((fn) => (...args) => fn(...args));
      const { register } = require(${JSON.stringify(unhandledSrc)});
    `;

    it('falls back to counting listeners: alone, the real error still crashes', () => {
      const res = runChild(`
        ${wrapped}
        register();
        Promise.reject(new Error('real failure'));
      `);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('real failure');
    });

    it('falls back to counting listeners: another listener defers the crash', () => {
      const res = runChild(`
        ${wrapped}
        register();
        process.on('unhandledRejection', (r) => process.stdout.write('OTHER:' + r.message));
        Promise.reject(new Error('real failure'));
      `);
      expect(res.stdout).toBe('OTHER:real failure');
      expect(res.status).toBe(0);
    });
  });

  describe('a process that cannot list its listeners', () => {
    const noListeners = `
      Object.defineProperty(process, 'listeners', { value: undefined, configurable: true });
      const { register } = require(${JSON.stringify(unhandledSrc)});
    `;

    it('falls back to counting listeners: another listener defers the crash', () => {
      const res = runChild(`
        ${noListeners}
        register();
        process.on('unhandledRejection', (r) => process.stdout.write('OTHER:' + r.message));
        Promise.reject(new Error('real failure'));
      `);
      expect(res.stdout).toBe('OTHER:real failure');
      expect(res.status).toBe(0);
    });

    it('falls back to counting listeners: alone, the real error still crashes', () => {
      const res = runChild(`
        ${noListeners}
        register();
        Promise.reject(new Error('real failure'));
      `);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('real failure');
    });

    it('register() and unregister() do not throw', () => {
      const res = runChild(`
        ${noListeners}
        register();
        require(${JSON.stringify(unhandledSrc)}).unregister();
        process.stdout.write('OK');
      `);
      expect(res.stdout).toBe('OK');
      expect(res.status).toBe(0);
    });
  });
});
