import {
  register,
  registerBun,
  registerDeno,
  registerElectron,
  registerNode,
  registerWorker,
  setWarn,
  unregister,
} from './index';

describe('environment detection', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    setWarn(true);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    unregister();
  });

  describe('bun', () => {
    beforeEach(() => {
      (globalThis as any).Bun = { version: '1.0.0' };
    });

    afterEach(() => {
      delete (globalThis as any).Bun;
    });

    it('register() labels the registration bun, not node', () => {
      register();
      registerNode();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered (bun), registering node'));
    });

    it('registerBun() twice reports a duplicate bun registration', () => {
      registerBun();
      registerBun();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered for type "bun"'));
    });

    it('registerBun() hooks the node mechanism', () => {
      const before = process.listenerCount('unhandledRejection');
      registerBun();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);

      unregister();

      expect(process.listenerCount('unhandledRejection')).toBe(before);
    });
  });

  describe('electron', () => {
    let addSpy: jest.Mock;
    let removeSpy: jest.Mock;
    let originalAdd: unknown;
    let originalRemove: unknown;

    beforeEach(() => {
      (process.versions as any).electron = '30.0.0';
      addSpy = jest.fn();
      removeSpy = jest.fn();
      originalAdd = (globalThis as any).addEventListener;
      originalRemove = (globalThis as any).removeEventListener;
      (globalThis as any).addEventListener = addSpy;
      (globalThis as any).removeEventListener = removeSpy;
    });

    afterEach(() => {
      delete (process.versions as any).electron;
      (globalThis as any).addEventListener = originalAdd;
      (globalThis as any).removeEventListener = originalRemove;
    });

    it('registerElectron() hooks both the process and the event target', () => {
      const before = process.listenerCount('unhandledRejection');
      registerElectron();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
      expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

      unregister();

      expect(process.listenerCount('unhandledRejection')).toBe(before);
      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('registerElectron() does not warn about its own second target', () => {
      registerElectron();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('registerElectron() outside Electron falls back to autodetection', () => {
      delete (process.versions as any).electron;
      const before = process.listenerCount('unhandledRejection');
      registerElectron();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
      expect(addSpy).not.toHaveBeenCalled();
    });

    it('registerElectron() falls back to the process only without an event target', () => {
      delete (globalThis as any).addEventListener;
      const before = process.listenerCount('unhandledRejection');
      registerElectron();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
      expect(addSpy).not.toHaveBeenCalled();
    });
  });
  describe('event target environments', () => {
    let addSpy: jest.Mock;
    let removeSpy: jest.Mock;
    let originalAdd: unknown;
    let originalRemove: unknown;

    beforeEach(() => {
      addSpy = jest.fn();
      removeSpy = jest.fn();
      originalAdd = (globalThis as any).addEventListener;
      originalRemove = (globalThis as any).removeEventListener;
    });

    afterEach(() => {
      (globalThis as any).addEventListener = originalAdd;
      (globalThis as any).removeEventListener = originalRemove;
    });

    it('registerDeno() attaches and detaches the global listener', () => {
      (globalThis as any).addEventListener = addSpy;
      (globalThis as any).removeEventListener = removeSpy;
      registerDeno();

      expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

      unregister();

      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('registerWorker() warns where no event target exists', () => {
      delete (globalThis as any).addEventListener;
      registerWorker();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to register handler for type "worker"'));
    });

    it('register() labels a Deno 2 runtime deno, not node', () => {
      (globalThis as any).addEventListener = addSpy;
      (globalThis as any).removeEventListener = removeSpy;
      // Deno 2 ships node compatibility on by default, so process.versions.node is populated too.
      (globalThis as any).Deno = { version: { deno: '2.1.0' } };
      const before = process.listenerCount('unhandledRejection');
      try {
        register();

        expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
        expect(process.listenerCount('unhandledRejection')).toBe(before);

        registerDeno();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered for type "deno"'));
      } finally {
        delete (globalThis as any).Deno;
      }
    });

    it('register() detects Deno before the browser', () => {
      (globalThis as any).addEventListener = addSpy;
      (globalThis as any).removeEventListener = removeSpy;
      (globalThis as any).Deno = { version: '2.0.0' };
      const nodeVersion = process.versions.node;
      delete (process.versions as any).node;
      try {
        register();
        registerDeno();

        expect(addSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered for type "deno"'));
      } finally {
        (process.versions as any).node = nodeVersion;
        delete (globalThis as any).Deno;
      }
    });

    it('register() warns in an environment it cannot detect', () => {
      delete (globalThis as any).addEventListener;
      const nodeVersion = process.versions.node;
      delete (process.versions as any).node;
      try {
        register();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown environment'));
      } finally {
        (process.versions as any).node = nodeVersion;
      }
    });
  });
});
