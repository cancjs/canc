import { isAbortError, isCancelError, isTimeoutError } from '@cancjs/promise';

export interface RegisterOptions {
  warn?: boolean;
  abort?: boolean;
  timeout?: boolean;
  onUnhandledRejection?: (reason: unknown, promise?: Promise<unknown>) => void;
}

let globalWarn: boolean =
  typeof process !== 'undefined' && process.env?.CANC_UNHANDLED_WARN !== undefined ?
    Boolean(Number(process.env.CANC_UNHANDLED_WARN))
  : true;

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
    Boolean(options?.abort && (isAbortError(error) || (isCancelError(error) && (error as any).aborted))) ||
    Boolean(options?.timeout && (isTimeoutError(error) || (isCancelError(error) && (error as any).timedOut)));
}

function tryRegister(type: string, setup: () => (() => void) | null, options?: RegisterOptions): void {
  const existingSameType = registrations.find((r) => r.type === type);
  if (existingSameType) {
    warnSafe(`Handler already registered for type "${type}". Skipping registration.`, options);
    return;
  }

  if (registrations.length > 0) {
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

export function registerNode(options?: RegisterOptions): void {
  tryRegister(
    'node',
    () => {
      if (typeof process === 'undefined' || typeof process.on !== 'function') {
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
    },
    options,
  );
}

function registerEventTarget(type: string, options?: RegisterOptions): void {
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
  );
}

export function registerBrowser(options?: RegisterOptions): void {
  registerEventTarget('browser', options);
}

export function registerDeno(options?: RegisterOptions): void {
  registerEventTarget('deno', options);
}

export function registerBun(options?: RegisterOptions): void {
  if (typeof process !== 'undefined' && (process as any).versions?.node) {
    registerNode(options);
  } else {
    registerEventTarget('bun', options);
  }
}

export function registerWorker(options?: RegisterOptions): void {
  registerEventTarget('worker', options);
}

export function register(options?: RegisterOptions): void {
  if (typeof process !== 'undefined' && (process as any).versions?.node) {
    registerNode(options);
  } else if (typeof globalThis !== 'undefined' && typeof (globalThis as any).Deno !== 'undefined') {
    registerDeno(options);
  } else if (typeof globalThis !== 'undefined' && typeof (globalThis as any).addEventListener === 'function') {
    registerBrowser(options);
  } else {
    warnSafe('Unknown environment: unable to autodetect unhandledrejection target.', options);
  }
}

export function registerElectron(options?: RegisterOptions): void {
  register(options);
}

export function unregister(): void {
  for (const reg of registrations) {
    reg.remove();
  }
  registrations.length = 0;
}
