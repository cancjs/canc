import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isCancelError } from '@cancjs/promise';

import { runBackup } from './backup-canc';
import { Manifest } from './manifest';
import { SiteApi } from './mock/site-api';

const outDir = join(__dirname, '..', 'out');
const manifestPath = join(outDir, 'backup-manifest.canc.json');

async function main(): Promise<void> {
  const api = new SiteApi({ latency: 40, jitter: 10, trace: console.log });
  const manifest: Manifest = { partial: false, entries: [] };

  let canceling = false;

  process.on('SIGINT', () => {
    if (canceling) {
      // second ctrl-c: give up on a clean stop, exit immediately
      console.log('canc: second SIGINT, forcing exit');
      process.exit(1);
    }
    canceling = true;
    console.log('canc: SIGINT received, canceling the whole task tree');

    // cancel settles once shielded finally writes manifest, ordered ahead of exit
    (async () => {
      try {
        await backupTask.cancel();
      } catch (error) {
        if (!isCancelError(error)) throw error;
      }
      mkdirSync(outDir, { recursive: true });
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`canc: manifest written (partial=${manifest.partial}) at ${manifestPath}`);
      process.exit(0);
    })();
  });

  console.log('canc: backup starting');
  const backupTask = runBackup(api, manifest);
  try {
    // SIGINT handler owns write and exit on cancel; ignore cancel rejection
    await backupTask;
  } catch (error) {
    if (!isCancelError(error)) throw error;
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`canc: manifest written (partial=${manifest.partial}) at ${manifestPath}`);
  process.exit(0);
}

main();
