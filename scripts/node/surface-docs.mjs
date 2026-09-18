// Runs by CI, cron, or hand.
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const NODE_PKG_DIR = join(ROOT, 'packages', 'canc-node');
const SURFACE_DIR = join(NODE_PKG_DIR, 'surface');
const README_PATH = join(NODE_PKG_DIR, 'README.md');
const DOCS_DIR = join(NODE_PKG_DIR, 'docs');
const RUNTIME_COMPAT_PATH = join(DOCS_DIR, 'runtime-compat.md');

const TRACKED_MAJORS = [18, 20, 22, 24, 26];

const COVERED_SPECIFIERS = [
  'fs',
  'fs/promises',
  'child_process',
  'timers',
  'timers/promises',
  'stream',
  'stream/promises',
  'stream/consumers',
  'stream/web',
  'dns',
  'dns/promises',
  'events',
  'crypto',
  'net',
  'tls',
  'http',
  'https',
  'http2',
  'zlib',
  'worker_threads',
  'readline',
  'readline/promises',
  'dgram',
  'sqlite',
  'util',
];

const GATED_CAPABILITIES = [
  { api: 'fs.statfs', minNode: '18.15', deno: 'ok', bun: 'ok', gate: 'feature-detect' },
  { api: 'fs.glob', minNode: '22.0', deno: 'ok', bun: 'ok', gate: 'throw NotImplementedError on older versions' },
  { api: 'fs.mkdtempDisposable', minNode: '24.4', deno: 'ok', bun: 'missing', gate: 'feature-detect' },
  {
    api: 'FileHandle.pull / writer',
    minNode: '25.9 (26+)',
    deno: 'unsupported',
    bun: 'unsupported',
    gate: 'feature-detect',
  },
  { api: 'fs.stat / lstat signal', minNode: '26.8', deno: 'n/a', bun: 'n/a', gate: 'conditional forward' },
  { api: 'FileHandle.stat signal', minNode: '26.1', deno: 'n/a', bun: 'n/a', gate: 'conditional forward' },
  { api: 'events.addAbortListener', minNode: '18.18 / 20.5', deno: 'ok', bun: 'ok', gate: 'polyfill' },
  { api: 'Symbol.asyncDispose', minNode: '18.18 / 20.4', deno: 'ok', bun: 'ok', gate: 'feature-detect' },
  { api: 'stream/consumers.bytes', minNode: 'unverified', deno: 'ok', bun: 'ok', gate: 'feature-detect' },
  { api: 'dns.resolveTlsa', minNode: '22', deno: 'unverified', bun: 'unverified', gate: 'throw' },
  { api: 'zlib zstd family', minNode: '22', deno: 'unverified', bun: 'unverified', gate: 'throw' },
  { api: 'zlib iterable compression', minNode: '24', deno: 'unverified', bun: 'unverified', gate: 'throw' },
  { api: 'zlib zip archive family', minNode: '26', deno: 'unverified', bun: 'unverified', gate: 'throw' },
  {
    api: 'crypto.argon2, encapsulate, decapsulate',
    minNode: '24',
    deno: 'unverified',
    bun: 'unverified',
    gate: 'throw',
  },
  { api: 'worker_threads.locks', minNode: '24', deno: 'unverified', bun: 'unverified', gate: 'throw' },
  { api: 'net.BoundSocket', minNode: '26.4', deno: 'unverified', bun: 'unverified', gate: 'feature-detect' },
  { api: 'http.IncomingMessage.signal', minNode: '26', deno: 'unverified', bun: 'unverified', gate: 'feature-detect' },
  { api: 'node:sqlite', minNode: '22.5', deno: 'ok', bun: 'missing', gate: 'dynamic import in try/catch' },
];

const GLYPH_OK = '\u2705';
const GLYPH_WARN = '\u{1F6A7}';
const GLYPH_CROSS = '\u2716';

let unverifiedCount = 0;

function resetUnverified() {
  unverifiedCount = 0;
}

function renderStatusGlyph(val) {
  if (!val || val === 'unverified' || val === 'UNVERIFIED') {
    unverifiedCount += 1;
    return 'unverified';
  }
  const s = String(val).toLowerCase();
  if (s === 'ok') return GLYPH_OK;
  if (s === 'strict-options' || s === 'gated' || s === 'feature-detect') return GLYPH_WARN;
  if (s === 'missing' || s === 'unsupported') return GLYPH_CROSS;
  if (s.includes('unverified')) {
    unverifiedCount += 1;
    return 'unverified';
  }
  return val;
}

function renderSignalField(nodeSignal) {
  if (!nodeSignal) return '-';
  if (nodeSignal.documented && nodeSignal.since) {
    return nodeSignal.since;
  }
  if (!nodeSignal.documented && nodeSignal.probed === 'reject:AbortError') {
    return 'works, undocumented';
  }
  return '-';
}

// Manifest is internal vocabulary; generator translates it to public wording
function renderCancellationBehavior(cancelCategory) {
  if (cancelCategory === 'A' || cancelCategory === 'C') {
    return 'stops the work';
  }
  if (cancelCategory === 'B') {
    return 'stops waiting only';
  }
  if (cancelCategory === 'D') {
    return 'before it starts';
  }
  return '-';
}

function renderNodeVersion(exp) {
  if (exp.minMajor) {
    return `${exp.minMajor}+`;
  }
  return '18+';
}

function formatMarkdownTable(headers, rows) {
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const r of rows) {
      const cell = r[i] !== undefined ? String(r[i]) : '';
      if (cell.length > max) max = cell.length;
    }
    return Math.max(max, 3);
  });

  const headerLine = `| ${headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ')} |`;
  const separatorLine = `| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  const dataLines = rows.map(
    (r) => `| ${r.map((cell, i) => String(cell !== undefined ? cell : '').padEnd(colWidths[i])).join(' | ')} |`,
  );

  return [headerLine, separatorLine, ...dataLines].join('\n');
}

export function generateReadmeSupportTables(manifests) {
  const sections = [];

  for (const manifest of manifests) {
    let subpathHeader;
    if (manifest.subpath.includes('#')) {
      const [parent, member] = manifest.subpath.split('#');
      subpathHeader = `#### ${member} (${parent})`;
    } else {
      subpathHeader = `#### ${manifest.subpath}`;
    }

    const headers = ['Export', 'Cancellation', 'Node', 'Deno', 'Bun'];
    const rows = [];

    for (const exp of manifest.exports) {
      if (exp.kind === 'type' || exp.callPath === 'sync' || exp.kind === 'const') continue;
      const exportName = `\`${exp.name}\``;
      const cancellation = renderCancellationBehavior(exp.cancelCategory);
      const nodeVersion = renderNodeVersion(exp);
      const deno = renderStatusGlyph(exp.runtime?.deno);
      const bun = renderStatusGlyph(exp.runtime?.bun);

      rows.push([exportName, cancellation, nodeVersion, deno, bun]);
    }

    // A manifest whose exports are all types, constants or sync members renders a header and a
    // bare header row. Published content, so the section is dropped rather than emitted empty.
    if (rows.length === 0) continue;

    sections.push(`${subpathHeader}\n\n${formatMarkdownTable(headers, rows)}`);
  }

  return sections.join('\n\n');
}

export function generateRuntimeCompatDoc(manifests, nodeLock, runtimeLock) {
  const sections = [];

  // Section 1: Versions under test
  const versionsHeaders = ['Runtime', 'Version', 'Source'];
  const versionsRows = [
    ['Node.js 18', nodeLock.generatedFrom['18'] || 'v18.20.8', 'Latest release for major (EOL)'],
    ['Node.js 20', nodeLock.generatedFrom['20'] || 'v20.20.2', 'Latest release for major (EOL)'],
    ['Node.js 22', nodeLock.generatedFrom['22'] || 'v22.23.2', 'Latest release for major (LTS)'],
    ['Node.js 24', nodeLock.generatedFrom['24'] || 'v24.20.0', 'Latest release for major (Active LTS)'],
    ['Node.js 26', nodeLock.generatedFrom['26'] || 'v26.8.1', 'Latest release for major (Current)'],
    ['Deno', runtimeLock.deno?.runtime?.replace(/^deno\s+/i, '') || '2.9.4', 'Installed test environment'],
    ['Bun', runtimeLock.bun?.runtime?.replace(/^bun\s+/i, '') || '1.3.14', 'Installed test environment'],
    ['Execution host', runtimeLock.node?.runtime || 'node v24.18.1', 'Probe execution environment'],
  ];

  sections.push(`## Versions under test\n\n${formatMarkdownTable(versionsHeaders, versionsRows)}`);

  // Section 2: Documentation-derived Node.js major versions
  const docDerivedIntro =
    '## Documentation-derived: Node.js major versions\n\n' +
    'The matrix below shows availability and documented abort signal support across tracked Node.js major versions.\n\n' +
    'Legend: `S` = Documented signal option, `y` = Present without signal, `-` = Absent in major.';

  const docDerivedSubsections = [docDerivedIntro];

  for (const manifest of manifests) {
    if (manifest.nodeSpecifier === null) continue;
    let subpathHeader;
    let lockPrefix;
    if (manifest.subpath.includes('#')) {
      const [parent, member] = manifest.subpath.split('#');
      subpathHeader = `### ${member} (${parent})`;
      lockPrefix = `promises_api.${member}.`;
    } else {
      subpathHeader = `### ${manifest.subpath} (${manifest.nodeSpecifier})`;
      lockPrefix = 'promises_api.';
    }

    const headers = ['Export', '18', '20', '22', '24', '26', 'Signal since', 'Added'];
    const rows = [];

    const base = manifest.subpath.split('#')[0];
    const specMod = manifest.nodeSpecifier ? manifest.nodeSpecifier.replace(/^node:/, '').split('/')[0] : null;
    const unhyphenated = base.replace(/-/g, '_');
    const mod =
      nodeLock.modules[base] ? base
      : specMod && nodeLock.modules[specMod] ? specMod
      : nodeLock.modules[unhyphenated] ? unhyphenated
      : base;
    const moduleLock = nodeLock.modules?.[mod] || {};

    for (const exp of manifest.exports) {
      if (exp.kind === 'type' || exp.callPath === 'sync' || exp.kind === 'const') continue;
      const exportName = `\`${exp.name}\``;
      const lockKey = `${lockPrefix}${exp.name}`;
      let lockEntry = moduleLock[lockKey];
      if (!lockEntry && moduleLock) {
        const found = Object.entries(moduleLock).find(([k]) => {
          const p = k.split('.');
          return p[p.length - 1] === exp.name;
        });
        if (found) lockEntry = found[1];
      }

      const majorCells = TRACKED_MAJORS.map((m) => {
        if (!lockEntry) return '-';
        if (lockEntry.signalIn?.includes(m)) return 'S';
        if (lockEntry.presentIn?.includes(m)) return 'y';
        return '-';
      });

      const signalSince = renderSignalField(exp.nodeSignal);
      const added = lockEntry?.added || (exp.minMajor ? `v${exp.minMajor}.0.0` : '-');

      rows.push([exportName, ...majorCells, signalSince, added]);
    }

    // A manifest whose exports are all types, constants or sync members renders a header and a
    // bare header row. Published content, so the section is dropped rather than emitted empty.
    if (rows.length === 0) continue;

    docDerivedSubsections.push(`${subpathHeader}\n\n${formatMarkdownTable(headers, rows)}`);
  }

  sections.push(docDerivedSubsections.join('\n\n'));

  // Section 3: Execution-derived alternative runtimes
  const execDerivedSections = [];
  execDerivedSections.push('## Execution-derived: alternative runtimes');

  // 3.1 Module availability
  const modHeaders = ['Specifier', 'Node.js', 'Deno', 'Bun'];
  const modRows = [];

  for (const spec of COVERED_SPECIFIERS) {
    const nodeExp = runtimeLock.node?.exports?.[spec];
    const denoExp = runtimeLock.deno?.exports?.[spec];
    const bunExp = runtimeLock.bun?.exports?.[spec];

    const renderExpCell = (exp) => {
      if (!exp) {
        unverifiedCount += 1;
        return 'unverified';
      }
      if (exp.error) {
        return `${GLYPH_CROSS} missing`;
      }
      if (Array.isArray(exp.keys)) {
        return `${exp.keys.length} exports`;
      }
      unverifiedCount += 1;
      return 'unverified';
    };

    modRows.push([`\`${spec}\``, renderExpCell(nodeExp), renderExpCell(denoExp), renderExpCell(bunExp)]);
  }

  execDerivedSections.push(
    `### Module availability\n\nLive import results across Node.js, Deno, and Bun runtime environments.\n\n${formatMarkdownTable(modHeaders, modRows)}`,
  );

  // 3.2 Signal honoring
  const sigHeaders = ['Function', 'Node.js', 'Deno', 'Bun'];
  const sigRows = [];

  const allSignalKeys = Object.keys(runtimeLock.node?.signalHonored || {});

  for (const fn of allSignalKeys) {
    const nodeRes = runtimeLock.node?.signalHonored?.[fn];
    const denoRes = runtimeLock.deno?.signalHonored?.[fn];
    const bunRes = runtimeLock.bun?.signalHonored?.[fn];

    const renderSigCell = (res) => {
      if (!res || res === 'unverified') {
        unverifiedCount += 1;
        return 'unverified';
      }
      if (res === 'reject:AbortError') return 'reject:AbortError';
      if (res === 'resolve') return 'resolve (ignored)';
      if (res === 'n/a:no-options-arg') return 'n/a (no options argument)';
      if (res.startsWith('other:')) {
        const parts = res.split(':');
        const code = parts[2] || parts[1];
        return `throws ${code}`;
      }
      return res;
    };

    sigRows.push([`\`${fn}\``, renderSigCell(nodeRes), renderSigCell(denoRes), renderSigCell(bunRes)]);
  }

  execDerivedSections.push(
    `### Signal honoring\n\nLive probe results executing candidate operations with a pre-aborted signal.\n\n${formatMarkdownTable(sigHeaders, sigRows)}`,
  );

  // 3.3 Version gated capabilities
  const gateHeaders = ['API', 'Min Node.js', 'Deno', 'Bun', 'Gate mechanism'];
  const gateRows = [];

  for (const item of GATED_CAPABILITIES) {
    const minNode = item.minNode === 'unverified' ? 'unverified' : item.minNode;
    if (minNode === 'unverified') unverifiedCount += 1;

    const deno = renderStatusGlyph(item.deno);
    const bun = renderStatusGlyph(item.bun);

    gateRows.push([`\`${item.api}\``, minNode, deno, bun, item.gate]);
  }

  execDerivedSections.push(`### Version gated capabilities\n\n${formatMarkdownTable(gateHeaders, gateRows)}`);

  sections.push(execDerivedSections.join('\n\n'));

  return sections.join('\n\n');
}

function updateGeneratedBlock(content, newBlock) {
  const startMarker = '<!-- generated:start -->';
  const endMarker = '<!-- generated:end -->';
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error('Missing or invalid generated markers in document');
  }

  const before = content.slice(0, startIndex + startMarker.length);
  const after = content.slice(endIndex);

  return `${before}\n\n${newBlock.trim()}\n\n${after}`;
}

export async function generateAll(options = {}) {
  const isCheck = options.check || false;
  resetUnverified();

  const nodeLockContent = await readFile(join(SURFACE_DIR, 'node-api.lock.json'), 'utf8');
  const runtimeLockContent = await readFile(join(SURFACE_DIR, 'runtime.lock.json'), 'utf8');

  const nodeLock = JSON.parse(nodeLockContent);
  const runtimeLock = JSON.parse(runtimeLockContent);

  const entries = await readdir(SURFACE_DIR);
  const manifestFiles = entries
    .filter((e) => e.endsWith('.json') && e !== 'schema.json' && e !== 'exclusions.json' && !e.endsWith('.lock.json'))
    .sort();

  const manifests = [];
  for (const file of manifestFiles) {
    const content = JSON.parse(await readFile(join(SURFACE_DIR, file), 'utf8'));
    manifests.push({ file, ...content });
  }
  manifests.sort((a, b) => a.subpath.localeCompare(b.subpath));

  // 1. Generate README tables
  const readmeGenerated = generateReadmeSupportTables(manifests);

  let readmeContent = await readFile(README_PATH, 'utf8');
  if (!readmeContent.includes('<!-- generated:start -->')) {
    const descIndex = readmeContent.indexOf('## Description');
    if (descIndex !== -1) {
      const plannedIndex = readmeContent.indexOf('### Planned subpaths', descIndex);
      if (plannedIndex !== -1) {
        readmeContent = `${readmeContent.slice(0, plannedIndex)}### Subpath support\n\n<!-- generated:start -->\n<!-- generated:end -->\n\n${readmeContent.slice(plannedIndex)}`;
      } else {
        readmeContent = `${readmeContent.slice(0, descIndex + '## Description\n\n'.length)}### Subpath support\n\n<!-- generated:start -->\n<!-- generated:end -->\n\n${readmeContent.slice(descIndex + '## Description\n\n'.length)}`;
      }
    } else {
      readmeContent += '\n\n## Subpath support\n\n<!-- generated:start -->\n<!-- generated:end -->\n';
    }
  }

  // 2. Generate runtime-compat.md
  const runtimeCompatGenerated = generateRuntimeCompatDoc(manifests, nodeLock, runtimeLock);

  if (!existsSync(DOCS_DIR)) {
    mkdirSync(DOCS_DIR, { recursive: true });
  }

  let runtimeCompatContent;
  if (existsSync(RUNTIME_COMPAT_PATH)) {
    runtimeCompatContent = await readFile(RUNTIME_COMPAT_PATH, 'utf8');
  } else {
    runtimeCompatContent =
      '# Runtime compatibility\n\n' +
      'Compatibility matrix across Node.js major versions, Deno, and Bun.\n\n' +
      'Two axes are kept distinct:\n' +
      '- The Node.js version axis is documentation-derived from official Node.js API documentation across tracked major versions.\n' +
      '- The alternative runtime axis is execution-derived from live runtime probes executed in each target environment.\n\n' +
      '<!-- generated:start -->\n<!-- generated:end -->\n\n' +
      '## Runtime behavioral quirks\n\n' +
      '- Numeric errno portability: numeric errno codes vary across platforms and alternative runtimes. Error code guards evaluate string error codes rather than numeric errno values.\n' +
      '- Unknown option keys on Deno: Deno rejects unknown option keys with invalid argument type errors on select methods. Signal forwarding is gated by function and version capability.\n' +
      '- Argument validation errors: programmer validation errors remain distinct from operational runtime failures.\n' +
      '- Error identity across runtimes: abort errors are matched by name rather than constructor instance checks or numeric codes.\n' +
      '- Deno permission error inspection: permission denials on Deno are matched through dedicated name guards.\n';
  }

  let updatedReadme = updateGeneratedBlock(readmeContent, readmeGenerated);
  let updatedRuntimeCompat = updateGeneratedBlock(runtimeCompatContent, runtimeCompatGenerated);

  updatedReadme = await prettier.format(updatedReadme, { filepath: README_PATH });
  updatedRuntimeCompat = await prettier.format(updatedRuntimeCompat, { filepath: RUNTIME_COMPAT_PATH });

  let hasDiff = false;

  if (isCheck) {
    if (readmeContent !== updatedReadme) {
      console.error('packages/canc-node/README.md is out of sync with manifests and locks');
      hasDiff = true;
    }
    if (runtimeCompatContent !== updatedRuntimeCompat) {
      console.error('packages/canc-node/docs/runtime-compat.md is out of sync with manifests and locks');
      hasDiff = true;
    }
  } else {
    if (readmeContent !== updatedReadme) {
      await writeFile(README_PATH, updatedReadme, 'utf8');
      console.log('Updated packages/canc-node/README.md');
    }
    if (runtimeCompatContent !== updatedRuntimeCompat) {
      await writeFile(RUNTIME_COMPAT_PATH, updatedRuntimeCompat, 'utf8');
      console.log('Updated packages/canc-node/docs/runtime-compat.md');
    }
  }

  console.log(`Unverified cells: ${unverifiedCount}`);

  if (isCheck && hasDiff) {
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const isCheck = process.argv.includes('--check');
  generateAll({ check: isCheck }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
