// WebSocket export server, canc flavor. Teaching payload.
//
// Each connection owns a cancel root (a pending CancelablePromise used as a scope handle). Every
// export job started on that connection is a child of the root: canceling the root cancels all of
// its jobs at once. Two things cancel a job here, and both land in the same chain cancel:
// 1. an explicit { type: 'cancel', jobId } message from the client,
// 2. the socket closing (tab closed, network drop) -> the whole connection root cancels.
//
// The inbound message stream is consumed with the platform's own `events.on(...)` async iterator,
// fed a signal derived from the connection root via `toAbortSignal`. When the root cancels, that
// signal aborts and the native iterator ends, so the read loop unwinds with the rest of the tree.

import * as canc from '@cancjs/coroutine';
import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';
import { toAbortSignal } from '@cancjs/toolbox';
import { on } from 'events';
import express from 'express';
import { createServer } from 'http';
import { join } from 'path';
import { WebSocket, WebSocketServer } from 'ws';

import { exportJob } from './export-job-canc';
import { createTranscoder, ExportBackend, Transcoder } from './mock/transcode';
import { ClientMessage, parseClientMessage, ServerMessage } from './protocol';

export interface ServerHandle {
  port: number;
  close: () => Promise<void>;
}

export function startServer(backend: ExportBackend, port = 0): Promise<ServerHandle> {
  const app = express();
  app.use(express.static(join(__dirname, '../public')));
  const http = createServer(app);
  const wss = new WebSocketServer({ server: http });

  // Build the canc-native transcoder once at the root, the only place the raw backend is touched.
  // Every handler below takes that transcoder, never the backend bundle.
  const transcode = createTranscoder(backend);
  wss.on('connection', (ws) => handleConnection(ws, transcode));

  return new Promise((resolve) => {
    http.listen(port, () => {
      const address = http.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            for (const client of wss.clients) client.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}

function handleConnection(ws: WebSocket, transcode: Transcoder): void {
  // The connection's cancel root: an intentional scope handle. A pending-forever CancelablePromise,
  // never resolved; canceling it cancels every job below. This is the only hand-built primitive.
  const connectionRoot = new CancelablePromise<void>(() => {});
  const jobs = new Map<string, CancelablePromise<void>>();

  // Socket close = second cancel path. Cancel the root; its children (all jobs) go with it.
  ws.on('close', () => connectionRoot.cancel(new CancelError('Connection closed')));
  // When the root cancels, drop every remaining job (the tree cancel).
  connectionRoot.then(undefined, () => {
    for (const job of jobs.values()) job.cancel();
  });

  void readMessages(ws, transcode, connectionRoot, jobs);
}

async function readMessages(
  ws: WebSocket,
  transcode: Transcoder,
  connectionRoot: CancelablePromise<void>,
  jobs: Map<string, CancelablePromise<void>>,
): Promise<void> {
  // The signal dies with the connection root, ending this native iterator cleanly.
  const signal = toAbortSignal(connectionRoot);
  try {
    for await (const [raw] of on(ws, 'message', { signal })) {
      const message = parseClientMessage(String(raw));
      if (!message) continue;
      dispatch(message, ws, transcode, jobs);
    }
  } catch (error) {
    if ((error as { name?: string }).name !== 'AbortError') throw error;
    // AbortError = the connection root canceled. Expected; nothing more to read.
  }
}

function dispatch(
  message: ClientMessage,
  ws: WebSocket,
  transcode: Transcoder,
  jobs: Map<string, CancelablePromise<void>>,
): void {
  if (message.type === 'start') {
    if (jobs.has(message.jobId)) return;
    jobs.set(message.jobId, runJob(message.jobId, ws, transcode, jobs));
  } else {
    // First cancel path: explicit message. Cancel the one job; its ack is sent from runJob.
    jobs.get(message.jobId)?.cancel();
  }
}

function runJob(
  jobId: string,
  ws: WebSocket,
  transcode: Transcoder,
  jobs: Map<string, CancelablePromise<void>>,
): CancelablePromise<void> {
  // The job is a coroutine that consumes the export stream. Its own cancel runs the iterator's
  // `return()` for us, which aborts the chunk in flight and stops every later chunk.
  const job = canc.async(function* () {
    const progressStream = exportJob(transcode);
    yield* canc.forAwait(progressStream, (percent) => {
      send(ws, { type: 'progress', jobId, percent: Number(percent) });
    });
  })();

  job.then(
    () => {
      jobs.delete(jobId);
      send(ws, { type: 'done', jobId });
    },
    (error) => {
      jobs.delete(jobId);
      // Cancel = ack the client. Shielded so the ack still sends even though the job chain is
      // canceling. A real failure is left to surface, not acked as a cancel.
      if (isCancelError(error)) {
        void suppressCancel((async () => send(ws, { type: 'canceled', jobId }))());
      }
    },
  );

  return job;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
