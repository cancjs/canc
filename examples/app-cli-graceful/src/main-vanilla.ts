import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SiteApi } from './mock/site-api';
import { runBackup } from './backup-vanilla';
import { Manifest } from './manifest';

const manifestPath = join(__dirname, '..', 'backup-manifest.vanilla.json');

async function main(): Promise<void> {
 const api = new SiteApi({ latency: 40, jitter: 10, trace: console.log });
 const manifest: Manifest = { partial: false, entries: [] };

 let aborted = false;
 let forceExit = false;

 process.on('SIGINT', () => {
 if (aborted) {
 // second ctrl-c: give up on a clean stop, exit immediately
 forceExit = true;
 console.log('vanilla: second SIGINT, forcing exit');
 process.exit(1);
 }
 aborted = true;
 console.log('vanilla: SIGINT received, flag set (in-flight downloads keep running)');
 });

 console.log('vanilla: backup starting');
 await runBackup(api, manifest, () => aborted);

 // manifest may be half-written -- exit raced the flush if SIGINT landed near process.exit
 writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
 console.log(`vanilla: manifest written (partial=${manifest.partial}) at ${manifestPath}`);

 if (!forceExit) {
 process.exit(0);
 }
}

main();
