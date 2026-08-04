import { _isAbortError, _isTimeoutError, isCancelError } from '@cancjs/promise';

export interface RegisterOptions {
  warn?: boolean;
  abort?: boolean;
  timeout?: boolean;
  onUnhandledRejection?: (reason: unknown, promise?: Promise<unknown>) => void;
}

// Anything but an explicit off value keeps warnings on, so a value a shell cannot express as a
// number (`CANC_UNHANDLED_WARN=true`) does not silently disable diagnostics.
function readWarnEnv(): boolean {
  if (typeof process === 'undefined' || process.env?.CANC_UNHANDLED_WARN === undefined) {
    return true;
  }
  const value = process.env.CANC_UNHANDLED_WARN.trim().toLowerCase();
  return value !== '0' && value !== 'false' && value !== '';
}

let globalWarn: boolean = readWarnEnv();

export function setWarn(enabled: boolean): void {
  globalWarn = enabled;
}

function warnSafe(msg: string, options?: RegisterOptions): void {
  const shouldWarn = options?.warn ?? globalWarn;
  if (shouldWarn && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[@cancjs/unhandled-rejection] ${msg}`);
  }
}

interface Registration {
  type: string;
  remove: () => void;
}

const registrations: Registration[] = [];

function buildIsSuppressed(options?: RegisterOptions): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    isCancelError(error) ||
    Boolean(options?.abort && _isAbortError(error)) ||
    Boolean(options?.timeout && _isTimeoutError(error));
}

function tryRegister(
  type: string,
  setup: () => (() => void) | null,
  options?: RegisterOptions,
  expectSiblings?: boolean,
): void {
  const existingSameType = registrations.find((r) => r.type === type);
  if (existingSameType) {
    warnSafe(`Handler already registered for type "${type}". Skipping registration.`, options);
    return;
  }

  if (registrations.length > 0 && !expectSiblings) {
    const existingTypes = registrations.map((r) => r.type).join(', ');
    warnSafe(`Handler already registered (${existingTypes}), registering ${type} alongside.`, options);
  }

  const remove = setup();
  if (remove) {
    registrations.push({ type, remove });
  } else {
    warnSafe(`Failed to register handler for type "${type}" in current environment.`, options);
  }
}

function hasNodeProcess(): boolean {
  return typeof process !== 'undefined' && typeof process.on === 'function';
}

function isBunRuntime(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).Bun !== 'undefined';
}

function isDenoRuntime(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).Deno !== 'undefined';
}

function isElectronRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean((process as any).versions?.electron);
}

function hasEventTarget(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).addEventListener === 'function';
}

function makeNodeSetup(options?: RegisterOptions): () => (() => void) | null {
  return () => {
    if (!hasNodeProcess()) {
      return null;
    }
    const isSuppressed = buildIsSuppressed(options);
    const handler = (reason: unknown, promise?: Promise<unknown>): void => {
      if (isSuppressed(reason)) {
        return;
      }
      if (options?.onUnhandledRejection) {
        options.onUnhandledRejection(reason, promise);
      } else {
        throw reason;
      }
    };
    process.on('unhandledRejection', handler);
    return () => {
      if (typeof process !== 'undefined' && typeof process.removeListener === 'function') {
        process.removeListener('unhandledRejection', handler);
      }
    };
  };
}

export function registerNode(options?: RegisterOptions): void {
  tryRegister('node', makeNodeSetup(options), options);
}

function registerEventTarget(type: string, options?: RegisterOptions, expectSiblings?: boolean): void {
  tryRegister(
    type,
    () => {
      const target: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
      if (!target || typeof target.addEventListener !== 'function') {
        return null;
      }
      const isSuppressed = buildIsSuppressed(options);
      const handler = (e: any): void => {
        const reason = e ? e.reason : undefined;
        if (isSuppressed(reason)) {
          if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
          }
          return;
        }
        if (options?.onUnhandledRejection) {
          if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
          }
          options.onUnhandledRejection(reason, e ? e.promise : undefined);
        }
      };
      target.addEventListener('unhandledrejection', handler);
      return () => {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener('unhandledrejection', handler);
        }
      };
    },
    options,
    expectSiblings,
  );
}

export function registerBrowser(options?: RegisterOptions): void {
  registerEventTarget('browser', options);
}

export function registerDeno(options?: RegisterOptions): void {
  registerEventTarget('deno', options);
}

// Bun defines process.versions.node, so the node mechanism is the one that works, but the
// registration is labeled bun to keep duplicate detection and warnings truthful.
export function registerBun(options?: RegisterOptions): void {
  if (hasNodeProcess()) {
    tryRegister('bun', makeNodeSetup(options), options);
  } else {
    registerEventTarget('bun', options);
  }
}

export function registerWorker(options?: RegisterOptions): void {
  registerEventTarget('worker', options);
}

export function register(options?: RegisterOptions): void {
  if (isBunRuntime()) {
    registerBun(options);
  } else if (isDenoRuntime()) {
    registerDeno(options);
  } else if (isElectronRuntime()) {
    registerElectron(options);
  } else if (typeof process !== 'undefined' && (process as any).versions?.node) {
    registerNode(options);
  } else if (hasEventTarget()) {
    registerBrowser(options);
  } else {
    warnSafe('Unknown environment: unable to autodetect unhandledrejection target.', options);
  }
}

// An Electron renderer has both a node process and a DOM, and renderer rejections land on the DOM
// event, so both targets are hooked. A main process has no addEventListener and gets node only.
export function registerElectron(options?: RegisterOptions): void {
  if (!isElectronRuntime()) {
    register(options);
    return;
  }
  if (hasNodeProcess()) {
    tryRegister('node', makeNodeSetup(options), options);
  }
  if (hasEventTarget()) {
    registerEventTarget('electron-renderer', options, true);
  }
}

export function unregister(): void {
  for (const reg of registrations) {
    reg.remove();
  }
  registrations.length = 0;
}
