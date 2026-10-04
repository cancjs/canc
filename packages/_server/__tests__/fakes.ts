import { CancelablePromise, ICancelablePromiseOptions } from '@cancjs/promise';
import { EventEmitter } from 'events';

/** Stand-in for ServerResponse, carrying the two things the disconnect guard reads. */
export class FakeResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;

  /** Normal completion: the response ends, then closes with nothing left to cancel. */
  end(): void {
    this.writableEnded = true;
    this.emit('close');
  }

  /** Client went away mid-response, which tears the response down as well as the socket. */
  disconnect(): void {
    this.destroyed = true;
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

/** A promise that never settles on its own, standing in for work still in flight. */
export function pending<T = never>(options?: ICancelablePromiseOptions): CancelablePromise<T> {
  return new CancelablePromise<T>(() => {
    /**/
  }, options);
}

/** Settles with whatever a task produced, value or error, so an assertion can read either. */
export function outcomeOf(task: CancelablePromise<unknown>): Promise<unknown> {
  return task.then(
    (value) => value,
    (error) => error,
  );
}

/** Settles after the microtask queue drains, without leaning on a timer. */
export function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
