// WebSocket export server where connection root cancels jobs on close or cancel message

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

  // canc-native transcoder built once at root
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
  // connection cancel root acting as scope handle for child jobs
  const connectionRoot = new CancelablePromise<void, any>(() => {});
  const jobs = new Map<string, CancelablePromise<void, any>>();

  // socket close cancels root and all child jobs
  ws.on('close', () => connectionRoot.cancel(new CancelError('Connection closed')));
  // cancel remaining child jobs on root cancel
  connectionRoot.then(undefined, () => {
    for (const job of jobs.values()) job.cancel();
  });

  void readMessages(ws, transcode, connectionRoot, jobs);
}

async function readMessages(
  ws: WebSocket,
  transcode: Transcoder,
  connectionRoot: CancelablePromise<void, any>,
  jobs: Map<string, CancelablePromise<void, any>>,
): Promise<void> {
  // signal aborts with connection root to end native iterator
  const signal = toAbortSignal(connectionRoot);
  try {
    for await (const [raw] of on(ws, 'message', { signal })) {
      const message = parseClientMessage(String(raw));
      if (!message) continue;
      dispatch(message, ws, transcode, jobs);
    }
  } catch (error) {
    if ((error as { name?: string }).name !== 'AbortError') throw error;
    // abort error on root cancel is expected
  }
}

function dispatch(
  message: ClientMessage,
  ws: WebSocket,
  transcode: Transcoder,
  jobs: Map<string, CancelablePromise<void, any>>,
): void {
  if (message.type === 'start') {
    if (jobs.has(message.jobId)) return;
    jobs.set(message.jobId, runJob(message.jobId, ws, transcode, jobs));
  } else {
    // cancel single job on explicit cancel message
    jobs.get(message.jobId)?.cancel();
  }
}

function runJob(
  jobId: string,
  ws: WebSocket,
  transcode: Transcoder,
  jobs: Map<string, CancelablePromise<void, any>>,
): CancelablePromise<void, any> {
  // coroutine job where cancel aborts in-flight chunk and stops stream
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
      // shielded ack sent to client on cancel
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
