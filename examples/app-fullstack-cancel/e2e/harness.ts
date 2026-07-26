import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';

const APP_ROOT = path.resolve(__dirname, '..');

export interface ServerHandle {
  port: number;
  base: string;
  /** Reset the PGlite query counter. */
  resetStats(): Promise<void>;
  /** How many PGlite statements have run since the last reset. */
  queryCount(): Promise<number>;
  stop(): Promise<void>;
}

export type Flavor = 'canc' | 'vanilla';

/** Boots e2e/test-server.ts as a real subprocess (native ESM) and waits until it is listening. */
export async function startServer(flavor: Flavor = 'canc'): Promise<ServerHandle> {
  const child: ChildProcess = spawn(
    process.execPath,
    ['--import', 'tsx', path.join('e2e', 'test-server.ts')],
    { cwd: APP_ROOT, env: { ...process.env, PORT: '0', CANC_FLAVOR: flavor }, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const port = await new Promise<number>((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('server start timed out')), 45_000);
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/LISTENING (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr!.on('data', (chunk: Buffer) => process.stderr.write(chunk.toString()));
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });

  const base = `http://127.0.0.1:${port}`;
  return {
    port,
    base,
    resetStats: () => request(`${base}/api/_stats/reset`, 'POST').then(() => undefined),
    queryCount: async () => JSON.parse(await request(`${base}/api/_stats`)).queries as number,
    stop: () =>
      new Promise<void>((resolve) => {
        child.on('exit', () => resolve());
        child.kill();
      }),
  };
}

/** Minimal promise-based HTTP for the harness (the client tests use the real cancelable axios). */
export function request(url: string, method = 'GET'): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
