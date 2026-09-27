import { isAbortError, isCancelError, isTimeoutError } from '@cancjs/promise';

/**
 * Options shared by every `register*` function.
 *
 * A CancelError is always suppressed (canceling is not a failure). `abort` and `timeout` extend
 * that suppression to AbortError and TimeoutError. `warn` overrides the global console warning
 * toggle (see {@link setWarn}) for this one registration. `onUnhandledRejection`, when given,
 * replaces the default handling (rethrow on Node, the platform default elsewhere) for anything
 * not suppressed.
 */
export interface RegisterOptions {
  /**
   * Overrides the global console warning toggle for this registration.
   * Defaults to the global setting (read from `CANC_UNHANDLED_WARN` at module load, default `true`).
   */
  warn?: boolean;
  /**
   * Widens suppression to include `AbortError` rejections.
   * Defaults to `false`.
   */
  abort?: boolean;
  /**
   * Widens suppression to include `TimeoutError` rejections.
   * Defaults to `false`.
   */
  timeout?: boolean;
  /**
   * Custom callback invoked for non-suppressed rejections instead of default handling.
   * Defaults to `undefined` (rethrows on Node, lets event proceed to platform default elsewhere).
   */
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

/** Overrides the default console-warning toggle read from `CANC_UNHANDLED_WARN` at module load. */
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
    Boolean(options?.abort && isAbortError(error)) ||
    Boolean(options?.timeout && isTimeoutError(error));
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

interface EdgeRuntimeGlobal {
  EdgeRuntime?: unknown;
}

// Vercel's Edge Runtime implements no `navigator`, so there is no standardized signal to read
// there. The `EdgeRuntime` global is the check Vercel documents, and only its presence is
// documented, so the value is not compared against anything.
function isEdgeRuntime(): boolean {
  const edgeRuntime = (globalThis as EdgeRuntimeGlobal).EdgeRuntime;
  return typeof edgeRuntime !== 'undefined';
}

interface NavigatorLike {
  userAgent?: unknown;
}

const RUNTIME_TOKENS = new Set(['node.js', 'bun', 'deno', 'cloudflare-workers']);

// WinterCG runtime identification: "Node.js/22", "Bun/1.0.28", "Deno/1.40.0", "Cloudflare-Workers".
// Absent on Node < 21 and in plenty of embedders, so this narrows when it can and says nothing
// when it cannot. A Mozilla/... (browser or jsdom) userAgent is treated as no signal, not as
// "browser", so a jsdom test host never outranks a real node process.
function readRuntimeToken(): string | undefined {
  try {
    const nav = (globalThis as { navigator?: NavigatorLike }).navigator;
    const userAgent = nav?.userAgent;
    if (typeof userAgent !== 'string') {
      return undefined;
    }
    // Not every runtime separates product and version with a slash: AWS LLRT reports "llrt 1.2.3",
    // whose leading token is the whole string. Anything added to the allowlist needs its real
    // userAgent shape checked rather than assumed.
    const leading = userAgent.split('/', 1)[0].trim().toLowerCase();
    return RUNTIME_TOKENS.has(leading) ? leading : undefined;
  } catch {
    // A hostile host can make `navigator` (or `.userAgent`) a throwing getter.
    return undefined;
  }
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

/** Registers Node's `process.on('unhandledRejection', ...)`. No-op (with a console warning) if no Node `process` is present. */
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

/** Registers `window.addEventListener('unhandledrejection', ...)`. No-op (with a console warning) if no such global exists. */
export function registerBrowser(options?: RegisterOptions): void {
  registerEventTarget('browser', options);
}

/** Registers Deno's `addEventListener('unhandledrejection', ...)`, the same standardized DOM-style event Deno implements. */
export function registerDeno(options?: RegisterOptions): void {
  registerEventTarget('deno', options);
}

/**
 * Registers Bun's unhandled-rejection handling. Bun defines `process.versions.node`, so the Node
 * mechanism is what actually runs underneath, but the registration is labeled `bun` to keep
 * duplicate detection and warnings truthful.
 */
export function registerBun(options?: RegisterOptions): void {
  if (hasNodeProcess()) {
    tryRegister('bun', makeNodeSetup(options), options);
  } else {
    registerEventTarget('bun', options);
  }
}

/** Registers a worker-scope `addEventListener('unhandledrejection', ...)` (Cloudflare Workers and similar). */
export function registerWorker(options?: RegisterOptions): void {
  registerEventTarget('worker', options);
}

/**
 * Registers the edge-runtime `addEventListener('unhandledrejection', ...)`. Vercel Edge, Next.js
 * edge routes and the edge-runtime test harness all expose the same global, so the label names the
 * runtime rather than any one product built on it.
 */
export function registerEdgeRuntime(options?: RegisterOptions): void {
  registerEventTarget('edge-runtime', options);
}

/**
 * Auto-detects the current runtime and registers the matching unhandled-rejection handler.
 * Electron is checked first (it has both a Node process and a DOM), then the WinterCG
 * `navigator.userAgent` token, then the documented Edge Runtime global, then falls back to
 * duck-typing globals and `process.versions`. Warns and does nothing if no target is recognized.
 *
 * Suppresses `CancelError` rejections while letting real rejections pass to `onUnhandledRejection`
 * or default runtime handling. Registration is idempotent per runtime target; multiple calls for
 * the same target skip duplicate installation. Installed handlers can be removed with {@link unregister}.
 */
export function register(options?: RegisterOptions): void {
  if (isElectronRuntime()) {
    registerElectron(options);
    return;
  }

  const token = readRuntimeToken();
  switch (token) {
    case 'bun':
      registerBun(options);
      return;
    case 'deno':
      registerDeno(options);
      return;
    case 'node.js':
      registerNode(options);
      return;
    case 'cloudflare-workers':
      registerWorker(options);
      return;
    default:
      break;
  }

  // Between the two: the standardized signal wins wherever one exists, and this runtime has none,
  // so its documented global is read before the older duck-typing chain.
  if (isEdgeRuntime()) {
    registerEdgeRuntime(options);
    return;
  }

  // No (or unrecognized) userAgent token: fall back to the original global/process.versions
  // sniffing, kept literally intact.
  if (isBunRuntime()) {
    registerBun(options);
  } else if (isDenoRuntime()) {
    registerDeno(options);
  } else if (typeof process !== 'undefined' && (process as any).versions?.node) {
    registerNode(options);
  } else if (hasEventTarget()) {
    registerBrowser(options);
  } else {
    warnSafe('Unknown environment: unable to autodetect unhandledrejection target.', options);
  }
}

/**
 * Registers Electron's unhandled-rejection handling. A renderer process has both a Node process
 * and a DOM, and renderer rejections land on the DOM event, so both targets are hooked; a main
 * process has no `addEventListener` and gets the Node target only. Falls back to {@link register}
 * when called outside Electron.
 */
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

/** Removes every handler installed by any `register*` call so far. */
export function unregister(): void {
  for (const reg of registrations) {
    reg.remove();
  }
  registrations.length = 0;
}
