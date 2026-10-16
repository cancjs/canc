// Verifies CI workflow run success on a release commit

'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

function getArg(name, defaultValue) {
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === `--${name}`) {
      if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) {
        return process.argv[i + 1];
      }
      return '';
    }
    if (arg.startsWith(`--${name}=`)) {
      return arg.slice(name.length + 3);
    }
  }
  return defaultValue;
}

async function main() {
  const sha = (getArg('sha', process.env.GITHUB_SHA || '') || '').trim();
  if (!/^[0-9a-fA-F]{40}$/.test(sha)) {
    console.error('FAIL --sha must be a full 40 character SHA');
    process.exit(1);
  }

  const workflow = getArg('workflow', 'ci.yml');
  const parsedGrace = Number(getArg('grace-sec', '120'));
  const graceSec = Number.isFinite(parsedGrace) && parsedGrace >= 0 ? parsedGrace : 120;
  const parsedTimeout = Number(getArg('timeout-min', '45'));
  const timeoutMin = Number.isFinite(parsedTimeout) && parsedTimeout >= 0 ? parsedTimeout : 45;
  const parsedPoll = Number(getArg('poll-sec', '20'));
  const pollSec = Number.isFinite(parsedPoll) && parsedPoll >= 0 ? parsedPoll : 20;
  const runsFile = getArg('runs-file', null);
  const ghBin = process.env.CANC_GH_BIN || 'gh';

  const startTime = Date.now();
  const graceMs = graceSec * 1000;
  const timeoutMs = timeoutMin * 60 * 1000;

  while (true) {
    let runs;
    if (runsFile !== null) {
      try {
        const raw = fs.readFileSync(runsFile, 'utf8');
        runs = JSON.parse(raw);
        if (!Array.isArray(runs)) {
          throw new Error('runs-file content is not an array');
        }
      } catch (err) {
        console.error(`FAIL gh run list failed: ${err.message || err}`);
        process.exit(1);
      }
    } else {
      try {
        const stdout = execFileSync(
          ghBin,
          [
            'run',
            'list',
            '--workflow',
            workflow,
            '--commit',
            sha,
            '--json',
            'databaseId,event,status,conclusion,createdAt,url',
            '--limit',
            '30',
          ],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
          },
        );
        runs = JSON.parse(stdout);
        if (!Array.isArray(runs)) {
          throw new Error('gh output is not an array');
        }
      } catch (err) {
        const msg = (err.stderr ? err.stderr.toString().trim() : '') || err.message || String(err);
        console.error(`FAIL gh run list failed: ${msg}`);
        process.exit(1);
      }
    }

    const matching = runs.filter((r) => r && (r.event === 'push' || r.event === 'workflow_dispatch'));

    if (matching.length === 0) {
      if (Date.now() - startTime >= graceMs) {
        console.error(`FAIL no CI run for ${sha}`);
        process.exit(1);
      }
    } else {
      matching.sort((a, b) => {
        const tb = Date.parse(b.createdAt) || 0;
        const ta = Date.parse(a.createdAt) || 0;
        if (tb !== ta) return tb - ta;
        return (Number(b.databaseId) || 0) - (Number(a.databaseId) || 0);
      });

      const newest = matching[0];

      if (newest.status === 'completed') {
        if (newest.conclusion === 'success') {
          console.log(`PASS CI green for ${sha}: ${newest.url}`);
          process.exit(0);
        } else {
          console.error(`FAIL CI ${newest.conclusion} for ${sha}: ${newest.url}`);
          process.exit(1);
        }
      }

      if (Date.now() - startTime >= timeoutMs) {
        console.error(`FAIL CI still running after ${timeoutMin} min`);
        process.exit(1);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollSec * 1000));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`FAIL: ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = { main };
