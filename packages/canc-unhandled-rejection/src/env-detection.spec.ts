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

// Node 21+ exposes a real global `navigator` (WinterCG), and register() now reads it as the
// primary signal. Every case below except the userAgent-specific ones is written against the
// pre-21 shape (no navigator at all), so it is neutralized here regardless of which Node version
// actually runs the suite; `navigator` is a configurable accessor property on Node, so it can be
// stubbed and the original descriptor restored exactly.
function stubNavigator(userAgent: string | undefined): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: userAgent === undefined ? undefined : { userAgent },
  });
}

describe('environment detection', () => {
  let warnSpy: jest.SpyInstance;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    setWarn(true);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    stubNavigator(undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    unregister();
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete (globalThis as any).navigator;
    }
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

  describe('userAgent runtime token', () => {
    let originalAdd: unknown;
    let originalRemove: unknown;

    beforeEach(() => {
      originalAdd = (globalThis as any).addEventListener;
      originalRemove = (globalThis as any).removeEventListener;
    });

    afterEach(() => {
      (globalThis as any).addEventListener = originalAdd;
      (globalThis as any).removeEventListener = originalRemove;
    });

    it('Node.js/22 userAgent routes to the node mechanism', () => {
      stubNavigator('Node.js/22');
      const before = process.listenerCount('unhandledRejection');

      register();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
    });

    it('Bun/1.0.28 userAgent routes to the node mechanism but labels the registration bun', () => {
      stubNavigator('Bun/1.0.28');

      register();
      registerNode();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered (bun), registering node'));
    });

    it('Deno/2.1.0 userAgent routes to the event target, not the node mechanism', () => {
      const addSpy = jest.fn();
      (globalThis as any).addEventListener = addSpy;
      (globalThis as any).removeEventListener = jest.fn();
      stubNavigator('Deno/2.1.0');
      const before = process.listenerCount('unhandledRejection');

      register();

      expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      expect(process.listenerCount('unhandledRejection')).toBe(before);
    });

    it('Cloudflare-Workers userAgent routes to the event target and is labeled truthfully', () => {
      const addSpy = jest.fn();
      (globalThis as any).addEventListener = addSpy;
      (globalThis as any).removeEventListener = jest.fn();
      stubNavigator('Cloudflare-Workers');

      register();

      expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

      registerWorker();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered for type "worker"'));
    });

    it('a fake globalThis.Deno does not win over a real Node.js userAgent', () => {
      // Must FAIL on the bare-global-sniffing-only code: that code picks deno unconditionally
      // whenever globalThis.Deno exists, regardless of what the runtime actually is.
      (globalThis as any).Deno = {};
      stubNavigator('Node.js/22');
      const before = process.listenerCount('unhandledRejection');

      try {
        register();

        expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
      } finally {
        delete (globalThis as any).Deno;
      }
    });

    it('a jsdom-shaped Mozilla userAgent does not win over a real node process', () => {
      // jsdom sets navigator.userAgent to a browser-shaped Mozilla/... string while
      // process.versions.node stays populated. That must read as no signal, not as "browser".
      stubNavigator('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/20.0.0');
      const before = process.listenerCount('unhandledRejection');

      register();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
    });

    it('with no navigator at all (Node 18/20 shape), register() still resolves via the fallback chain', () => {
      expect((globalThis as any).navigator).toBeUndefined();
      const before = process.listenerCount('unhandledRejection');

      register();

      expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
    });
  });
});
