// Shared scripted scenario used by both entries: send a chat request, read a few streamed tokens,
// then hang up mid-stream (the Stop button). Prints what arrived and the resulting usage log so the
// vanilla vs canc difference is visible without a browser.

import http from 'node:http';
import { sleep } from '@shared/util';
import { UsageLog } from './chat';

export async function runScenario(port: number, log: UsageLog, flavor: string): Promise<void> {
 const prompt = 'How do I reset my password and update my billing address and contact support';
 const received: string[] = [];

 await new Promise<void>((resolve) => {
 const request = http.request(
 { host: 'localhost', port, path: '/chat', method: 'POST', headers: { 'content-type': 'application/json' } },
 (res) => {
 res.setEncoding('utf8');
 res.on('data', (chunk: string) => {
 received.push(chunk);
 // Hang up after a couple of tokens, simulating the user pressing Stop mid-reply.
 if (received.length === 2) request.destroy();
 });
 res.on('close', resolve);
 }
 );
 request.on('error', () => resolve()); // destroy() surfaces as a socket error; expected
 request.end(JSON.stringify({ prompt }));
 });

 // Give the server a moment to observe the disconnect and settle the handler chain.
 await sleep(200);

 console.log(`${flavor}: received ${received.length} token chunks before Stop`);
 const entry = log.entries[log.entries.length - 1];
 if (entry) {
 console.log(`${flavor}: billed ${entry.tokens} tokens, canceled=${entry.canceled}`);
 }
}
