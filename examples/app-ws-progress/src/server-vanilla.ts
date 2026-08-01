// WebSocket export server, vanilla flavor. Teaching payload.
//
// There is no cancel root and no job tree. The only thing a cancel message or a socket close can
// do is stop SENDING frames (a boolean flag). The export job itself has no signal to thread, so
// every remaining chunk still transcodes on the server. The client sees the progress bar freeze;
// the machine keeps doing the work it dropped on the floor.
//
// The inbound message stream is read with the same platform `events.on(...)` iterator, but without
// a signal there is nothing to end it early. It unwinds only when the socket emits its own close.

import { MockApi } from '@shared/mock-api';
import { on } from 'events';
import express from 'express';
import { createServer } from 'http';
import { join } from 'path';
import { WebSocket, WebSocketServer } from 'ws';

import { exportJob } from './export-job-vanilla';
import { ClientMessage, parseClientMessage, ServerMessage } from './protocol';

export interface ServerHandle {
  port: number;
  api: MockApi;
  close: () => Promise<void>;
}

export function startServer(api: MockApi, port = 0): Promise<ServerHandle> {
  const app = express();
  app.use(express.static(join(__dirname, '../public')));
  const http = createServer(app);
  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws) => handleConnection(ws, api));

  return new Promise((resolve) => {
    http.listen(port, () => {
      const address = http.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        api,
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

function handleConnection(ws: WebSocket, api: MockApi): void {
  // No cancel root: the best we can track is which jobs should stop being sent.
  const stopped = new Set<string>();
  const jobs = new Set<string>();

  // Socket close only marks every job stopped-for-sending. The transcode keeps going server-side.
  ws.on('close', () => {
    for (const jobId of jobs) stopped.add(jobId);
  });
  // (no cancellation counterpart - see -canc: closing cancels the whole tree there)

  void readMessages(ws, api, stopped, jobs);
}

async function readMessages(ws: WebSocket, api: MockApi, stopped: Set<string>, jobs: Set<string>): Promise<void> {
  // No signal to derive: this iterator ends only when the socket itself closes.
  try {
    for await (const [raw] of on(ws, 'message')) {
      const message = parseClientMessage(String(raw));
      if (!message) continue;
      dispatch(message, ws, api, stopped, jobs);
    }
  } catch (error) {
    if ((error as { name?: string }).name !== 'AbortError') throw error;
    // AbortError never happens here (no signal); kept aligned with -canc.
  }
}

function dispatch(message: ClientMessage, ws: WebSocket, api: MockApi, stopped: Set<string>, jobs: Set<string>): void {
  if (message.type === 'start') {
    if (jobs.has(message.jobId)) return;
    jobs.add(message.jobId);
    void runJob(message.jobId, ws, api, stopped, jobs);
  } else {
    // "Cancel" here only stops SENDING. The chunks 41..100 still transcode on the server.
    stopped.add(message.jobId);
    send(ws, { type: 'canceled', jobId: message.jobId });
  }
}

async function runJob(
  jobId: string,
  ws: WebSocket,
  api: MockApi,
  stopped: Set<string>,
  jobs: Set<string>,
): Promise<void> {
  // No signal to thread; every chunk runs to completion regardless of `stopped`.
  const iter = exportJob({ api });

  for await (const percent of iter) {
    // Guard only the SEND. The `await transcodeChunk` above already ran; work is not saved.
    if (!stopped.has(jobId)) send(ws, { type: 'progress', jobId, percent });
  }
  jobs.delete(jobId);
  if (!stopped.has(jobId)) send(ws, { type: 'done', jobId });
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
