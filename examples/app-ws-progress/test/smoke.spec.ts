import { WebSocket } from 'ws';
import { MockApi } from '@shared/mock-api';
import { startServer as startCanc, ServerHandle } from '../src/server-canc';
import { startServer as startVanilla } from '../src/server-vanilla';
import { ServerMessage } from '../src/protocol';

type CancelAt30 = (ws: WebSocket, jobId: string) => void;

// Drive one connection: start a job, run `cancelAt30` at the first frame >= 30%, then wait
// `settleMs` and resolve with the chunk-status counts the server recorded.
function driveOne(port: number, cancelAt30: CancelAt30, settleMs: number, api: MockApi) {
 return new Promise<{ started: number; completed: number; aborted: number; ack: boolean }>((resolve) => {
 const ws = new WebSocket(`ws://localhost:${port}`);
 const jobId = 'export-1';
 let canceled = false;
 let ack = false;

 const report = () => resolve({
 started: api.calls.length,
 completed: api.calls.filter((c) => c.status === 'completed').length,
 aborted: api.calls.filter((c) => c.status === 'aborted').length,
 ack,
 });

 ws.on('open', () => ws.send(JSON.stringify({ type: 'start', jobId })));
 ws.on('message', (raw) => {
 const message = JSON.parse(String(raw)) as ServerMessage;
 if (message.type === 'canceled') ack = true;
 if (message.type === 'progress' && message.percent >= 30 && !canceled) {
 canceled = true;
 cancelAt30(ws, jobId);
 setTimeout(report, settleMs);
 }
 });
 });
}

describe('app-ws-progress: cancel stops the export', () => {
 let handle: ServerHandle;
 let api: MockApi;

 beforeEach(async () => {
 api = new MockApi({ latency: 5, jitter: 0 });
 handle = await startCanc(api);
 });

 afterEach(async () => {
 await handle.close();
 });

 it('explicit cancel message freezes the transcode (at most one more chunk starts)', async () => {
 const r = await driveOne(handle.port, (ws, jobId) => {
 ws.send(JSON.stringify({ type: 'cancel', jobId }));
 }, 120, api);

 // ~30 chunks started when cancel arrives; the frozen count must be well under the full 100
 // and at most one chunk past the last completed one (the aborted, in-flight chunk).
 expect(r.started).toBeLessThan(100);
 expect(r.started).toBeLessThanOrEqual(r.completed + 1);
 expect(r.aborted).toBeGreaterThanOrEqual(1);
 expect(r.ack).toBe(true);
 });

 it('hard socket close cancels the whole connection tree the same way', async () => {
 const r = await driveOne(handle.port, (ws) => {
 ws.close();
 }, 120, api);

 expect(r.started).toBeLessThan(100);
 expect(r.started).toBeLessThanOrEqual(r.completed + 1);
 expect(r.aborted).toBeGreaterThanOrEqual(1);
 });
});

describe('app-ws-progress: vanilla keeps transcoding (the bug we teach)', () => {
 let handle: ServerHandle;
 let api: MockApi;

 beforeEach(async () => {
 api = new MockApi({ latency: 2, jitter: 0 });
 handle = await startVanilla(api);
 });

 afterEach(async () => {
 await handle.close();
 });

 it('cancel only stops sending; every chunk still completes on the server', async () => {
 const r = await driveOne(handle.port, (ws, jobId) => {
 ws.send(JSON.stringify({ type: 'cancel', jobId }));
 }, 2000, api);

 // Inverted assertion: the whole export ran regardless of the cancel.
 expect(r.started).toBe(100);
 expect(r.completed).toBe(100);
 expect(r.aborted).toBe(0);
 });
});
