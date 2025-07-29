import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCancelError } from '@cancjs/promise';
import { SiteApi } from './mock/site-api';
import { runBackup } from './backup-canc';
import { Manifest } from './manifest';

const manifestPath = join(__dirname, '..', 'backup-manifest.canc.json');

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

 // await root.cancel() before process.exit: cancellation reaches every in-flight download
 // immediately, and this only settles once the shielded finally has finished writing `manifest`
 // -- ordered ahead of exit rather than racing it. cancel() always settles rejected once that
 // finally completes, so the rejection itself is expected here, not an error to surface.
 (async () => {
 try {
 await root.cancel();
 } catch (error) {
 if (!isCancelError(error)) throw error;
 }
 writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
 console.log(`canc: manifest written (partial=${manifest.partial}) at ${manifestPath}`);
 process.exit(0);
 })();
 });

 console.log('canc: backup starting');
 const root = runBackup(api, manifest);
 try {
 // canceled here -- the SIGINT handler above owns the write and exit once its own await of
 // root.cancel() settles, so this rejection needs no handling beyond letting it fall through
 await root;
 } catch (error) {
 if (!isCancelError(error)) throw error;
 return;
 }

 writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
 console.log(`canc: manifest written (partial=${manifest.partial}) at ${manifestPath}`);
 process.exit(0);
}

main();
