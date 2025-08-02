// Scripted run of the vanilla server: start a job, "cancel" it at ~30%, then report how many
// chunks the server actually transcoded. The cancel only stops sending, so every chunk still
// completes on the server: started climbs to 100, aborted stays 0. That gap is the lesson.

import { WebSocket } from 'ws';
import { MockApi } from '@shared/mock-api';
import { startServer } from './server-vanilla';
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
 // Wait for the WHOLE export to finish anyway, then report: nothing was actually stopped.
 setTimeout(report, 700);
 }
 if (message.type === 'canceled') console.log('server ack: canceled (sending only)');
 });
 });
}

main().catch((error) => { console.error(error); process.exit(1); });
