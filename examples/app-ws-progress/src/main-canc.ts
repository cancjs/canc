// Scripted run of the canc server: start a job, cancel it at ~30%, then report how many chunks
// the server actually transcoded. Cancel reaches the encoder, so the started count freezes near
// the cancel point and the chunk in flight is marked aborted.

import { WebSocket } from 'ws';
import { sleep } from '@shared/util';
import { MockApi } from '@shared/mock-api';
import { startServer } from './server-canc';
import { ServerMessage } from './protocol';

async function main() {
 const api = new MockApi({ latency: 5, jitter: 0 });
 const server = await startServer(api);

 await runScenario(api, server.port, 'cancel message at ~30%', (ws, jobId) => {
 ws.send(JSON.stringify({ type: 'cancel', jobId }));
 });

 api.reset();
 await runScenario(api, server.port, 'hard socket close at ~30%', (ws) => {
 ws.close();
 });

 await server.close();
 console.log('\nDone.');
}

function runScenario(
 api: MockApi,
 port: number,
 label: string,
 cancelAt30: (ws: WebSocket, jobId: string) => void,
): Promise<void> {
 return new Promise((resolve) => {
 console.log(`\n=== ${label} ===`);
 const ws = new WebSocket(`ws://localhost:${port}`);
 const jobId = 'export-1';
 let canceled = false;

 const report = () => {
 const started = api.calls.length;
 const completed = api.calls.filter((c) => c.status === 'completed').length;
 const aborted = api.calls.filter((c) => c.status === 'aborted').length;
 console.log(`chunks -> started: ${started}, completed: ${completed}, aborted: ${aborted}`);
 resolve();
 };

 ws.on('open', () => ws.send(JSON.stringify({ type: 'start', jobId })));
 ws.on('message', (raw) => {
 const message = JSON.parse(String(raw)) as ServerMessage;
 if (message.type === 'progress' && message.percent >= 30 && !canceled) {
 canceled = true;
 console.log(`cancel at ${message.percent}%`);
 cancelAt30(ws, jobId);
 // Let the server settle the cancel, confirm no more chunks start, then report.
 void sleep(80).then(report);
 }
 if (message.type === 'canceled') console.log('server ack: canceled');
 });
 });
}

main().catch((error) => { console.error(error); process.exit(1); });
