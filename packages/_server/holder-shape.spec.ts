import { createCancelSignal } from '@cancjs/promise';

import { createExchange, FakeServer } from './__tests__/fakes';
import {
  getRequestRegistry,
  getRequestState,
  IRequestCancelState,
  IRequestRegistry,
  REQUEST_CANCEL_STATE,
  REQUEST_REGISTRY,
  setRequestState,
  SHUTDOWN_FUNCTION,
  SHUTDOWN_STATE,
  trackConnections,
} from './holder';
import { runCancelableHandler } from './run';

// Type pins fail compilation when a shared holder field is added, removed or renamed.
const requestStateFields: { [K in keyof Required<IRequestCancelState>]: true } = {
  cancel: true,
  cancelForwarded: true,
  decorateCancel: true,
  holding: true,
  hooks: true,
  live: true,
  options: true,
  response: true,
  routeSignals: true,
  shuttingDown: true,
  signal: true,
  timer: true,
  watch: true,
};

const registryFields: { [K in keyof Required<IRequestRegistry>]: true } = {
  connections: true,
  onArrival: true,
  onTrack: true,
  open: true,
};

describe('shared holder shapes', () => {
  it('pins the request cancellation fields', () => {
    expect(Object.keys(requestStateFields).sort()).toEqual(
      [
        'cancel',
        'cancelForwarded',
        'decorateCancel',
        'holding',
        'hooks',
        'live',
        'options',
        'response',
        'routeSignals',
        'shuttingDown',
        'signal',
        'timer',
        'watch',
      ].sort(),
    );
  });

  it('pins the per-server request registry fields', () => {
    expect(Object.keys(registryFields).sort()).toEqual(['connections', 'onArrival', 'onTrack', 'open']);
  });

  it('keeps the cross-copy symbol strings', () => {
    expect(REQUEST_CANCEL_STATE).toBe(Symbol.for('@cancjs/server-node:RequestCancelState'));
    expect(REQUEST_REGISTRY).toBe(Symbol.for('@cancjs/server-node:RequestRegistry'));
    expect(SHUTDOWN_STATE).toBe(Symbol.for('@cancjs/server-node:ShutdownState'));
    expect(SHUTDOWN_FUNCTION).toBe(Symbol.for('@cancjs/server-node:ShutdownFunction'));
  });

  it('adds connection tracking to a registry created by an older copy', () => {
    const server = new FakeServer();
    const preset: IRequestRegistry = { open: new Map() };
    Object.defineProperty(server, REQUEST_REGISTRY, { configurable: true, value: preset, writable: true });
    trackConnections(server);

    expect(getRequestRegistry(server)).toBe(preset);
    expect(preset.connections).toBeInstanceOf(Map);
  });

  it('runs a handler using a request holder written by an older copy', async () => {
    const { req, res } = createExchange();
    const { cancel, signal } = createCancelSignal();
    const preset: IRequestCancelState = { cancel, live: new Set(), options: {}, signal };
    setRequestState(req, preset);

    await expect(
      runCancelableHandler(
        function* () {
          return 7;
        },
        req,
        res,
      ),
    ).resolves.toBe(7);
    expect(getRequestState(req)).toBe(preset);
  });
});
