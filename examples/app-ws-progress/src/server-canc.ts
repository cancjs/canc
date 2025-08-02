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

import { createServer } from 'http';
import { on } from 'events';
import { join } from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { CancelablePromise, CancelError } from '@cancjs/promise';
import { toAbortSignal, suppress } from '@cancjs/toolbox';
import { MockApi } from '@shared/mock-api';
import { exportJob } from './export-job-canc';
import { ClientMessage, ServerMessage, parseClientMessage } from './protocol';

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
 close: () => new Promise<void>((done) => {
 for (const client of wss.clients) client.terminate();
 wss.close();
 http.close(() => done());
 }),
 });
 });
 });
}

function handleConnection(ws: WebSocket, api: MockApi): void {
 // The connection's cancel root. Pending forever until the connection ends; canceling it cancels
 // every job below.
 const connectionRoot = new CancelablePromise<void>(() => {});
 const jobs = new Map<string, CancelablePromise<void>>();

 // Socket close = second cancel path. Cancel the root; its children (all jobs) go with it.
 ws.on('close', () => connectionRoot.cancel(new CancelError('Connection closed')));
 // When the root cancels, drop every remaining job (the tree cancel).
 connectionRoot.then(undefined, () => { for (const job of jobs.values()) job.cancel(); });

 void readMessages(ws, api, connectionRoot, jobs);
}

async function readMessages(
 ws: WebSocket,
 api: MockApi,
 connectionRoot: CancelablePromise<void>,
 jobs: Map<string, CancelablePromise<void>>,
): Promise<void> {
 // The signal dies with the connection root, ending this native iterator cleanly.
 const signal = toAbortSignal(connectionRoot);
 try {
 for await (const [raw] of on(ws, 'message', { signal })) {
 const message = parseClientMessage(String(raw));
 if (!message) continue;
 dispatch(message, ws, api, jobs);
 }
 } catch (error) {
 if ((error as { name?: string }).name !== 'AbortError') throw error;
 // AbortError = the connection root canceled. Expected; nothing more to read.
 }
}

function dispatch(
 message: ClientMessage,
 ws: WebSocket,
 api: MockApi,
 jobs: Map<string, CancelablePromise<void>>,
): void {
 if (message.type === 'start') {
 if (jobs.has(message.jobId)) return;
 jobs.set(message.jobId, runJob(message.jobId, ws, api, jobs));
 } else {
 // First cancel path: explicit message. Cancel the one job; its ack is sent from runJob.
 jobs.get(message.jobId)?.cancel();
 }
}

function runJob(
 jobId: string,
 ws: WebSocket,
 api: MockApi,
 jobs: Map<string, CancelablePromise<void>>,
): CancelablePromise<void> {
 const job = new CancelablePromise<void>((resolve, reject, onCancel) => {
 // The job's own signal, threaded into every transcode chunk so a cancel aborts the chunk in
 // flight. Both cancel paths (message + close) reach the encoder through it.
 const controller = new AbortController();
 const iter = exportJob({ api, signal: controller.signal });

 (async () => {
 for await (const percent of iter) {
 send(ws, { type: 'progress', jobId, percent: Number(percent) });
 }
 resolve();
 })().catch(reject);

 // Cancel = abort the in-flight chunk, stop the iterator (runs its finally), ack the client.
 onCancel(() => {
 controller.abort();
 void iter.return?.(undefined);
 // Shielded so the ack still sends even though the job chain is canceling.
 void suppress(['cancel'], (async () => send(ws, { type: 'canceled', jobId }))());
 });
 });

 job.then(
 () => { jobs.delete(jobId); send(ws, { type: 'done', jobId }); },
 () => { jobs.delete(jobId); },
 );

 return job;
}

function send(ws: WebSocket, message: ServerMessage): void {
 if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
