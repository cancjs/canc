import { EventEmitter } from 'events';

/** Stand-in for ServerResponse, carrying the two things the disconnect guard reads. */
export class FakeResponse extends EventEmitter {
  writableEnded = false;

  /** Normal completion: the response ends, then closes with nothing left to cancel. */
  end(): void {
    this.writableEnded = true;
    this.emit('close');
  }

  /** Client went away mid-response. */
  disconnect(): void {
    this.emit('close');
  }
}

/** Stand-in for IncomingMessage. */
export class FakeRequest extends EventEmitter {
  destroyed = false;
  socket: { server?: unknown } | null = null;
}

/** Stand-in for http.Server, recording which teardown calls a drain made. */
export class FakeServer {
  closed = 0;
  idleClosed = 0;
  allClosed = 0;

  close(callback?: (error?: Error) => void): void {
    this.closed += 1;
    callback?.();
  }

  closeIdleConnections(): void {
    this.idleClosed += 1;
  }

  closeAllConnections(): void {
    this.allClosed += 1;
  }
}

/** A request and response pair wired to a server, the shape every adapter hands the run layer. */
export function createExchange(server?: object) {
  const req = new FakeRequest();
  const res = new FakeResponse();
  req.socket = { server };

  return { req, res };
}

/** Settles after the microtask queue drains, without leaning on a timer. */
export function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
