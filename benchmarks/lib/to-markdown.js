'use strict';

/**
 * Renders a single suite result ({ suite, env, tasks }) as a markdown table.
 * Kept separate from run-suite.js so the report generator can reuse it
 * across multiple result files without re-running benches.
 */
function resultToMarkdown(result) {
  const { suite, env, tasks } = result;

  const lines = [];
  lines.push(`## Suite: ${suite}`);
  lines.push('');
  lines.push(
    `Node ${env.node} · ${env.platform}/${env.arch} · ${env.cpuModel} (${env.cpuCount} cores) · ${env.timestamp}`,
  );
  lines.push('');
  lines.push('| Case | ops/sec | margin | mean (ms) | samples |');
  lines.push('|------|--------:|-------:|----------:|--------:|');

  for (const task of tasks) {
    const ops = task.opsPerSec != null ? task.opsPerSec.toFixed(0) : 'n/a';
    const margin = task.marginPct != null ? `±${task.marginPct.toFixed(2)}%` : 'n/a';
    const mean = task.meanMs != null ? task.meanMs.toFixed(4) : 'n/a';
    lines.push(`| ${task.name} | ${ops} | ${margin} | ${mean} | ${task.samples} |`);
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = { resultToMarkdown };
