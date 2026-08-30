// Runs by CI, cron, or hand.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

const TRACKED_MAJORS = [18, 20, 22, 24, 26];

const COVERED_MODULES = [
  'fs',
  'child_process',
  'timers',
  'stream',
  'events',
  'dns',
  'net',
  'tls',
  'http',
  'https',
  'http2',
  'zlib',
  'worker_threads',
  'readline',
  'dgram',
  'sqlite',
  'util',
];

const ROOT_SECTION_ALIASES = {
  file_system: 'fs',
  'udp/datagram_sockets': 'dgram',
  'tls_(ssl)': 'tls',
  'http/2': 'http2',
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CACHE_DIR = join(ROOT, '.cache', 'node-api');
const LOCK_FILE = join(ROOT, 'packages', 'canc-node', 'surface', 'node-api.lock.json');

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveLatestPerMajor(majors, isCheckMode) {
  const versionsCacheFile = join(CACHE_DIR, 'versions.json');
  if (isCheckMode && (await pathExists(versionsCacheFile))) {
    const raw = await readFile(versionsCacheFile, 'utf8');
    return JSON.parse(raw);
  }

  const res = await fetch('https://nodejs.org/dist/index.json');
  if (!res.ok) {
    if (await pathExists(versionsCacheFile)) {
      const raw = await readFile(versionsCacheFile, 'utf8');
      return JSON.parse(raw);
    }
    throw new Error(`Failed to fetch node index: HTTP ${res.status}`);
  }

  const index = await res.json();
  const out = {};
  for (const rel of index) {
    const maj = Number(rel.version.slice(1).split('.')[0]);
    if (majors.includes(maj) && !out[maj]) {
      out[maj] = { version: rel.version, date: rel.date, lts: rel.lts };
    }
  }

  if (!isCheckMode) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(versionsCacheFile, JSON.stringify(out, null, 2) + '\n', 'utf8');
  }

  return out;
}

async function fetchDoc(version, docName, isCheckMode) {
  const versionDir = join(CACHE_DIR, version);
  const cacheFile = join(versionDir, `${docName}.json`);

  if (await pathExists(cacheFile)) {
    const raw = await readFile(cacheFile, 'utf8');
    return JSON.parse(raw);
  }

  const url = `https://nodejs.org/dist/${version}/docs/api/${docName}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    const missing = { __missing: res.status };
    if (!isCheckMode) {
      await mkdir(versionDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(missing, null, 2) + '\n', 'utf8');
    }
    return missing;
  }

  const text = await res.text();
  if (!isCheckMode) {
    await mkdir(versionDir, { recursive: true });
    await writeFile(cacheFile, text, 'utf8');
  }
  return JSON.parse(text);
}

function flatParam(p) {
  return {
    name: p.name,
    type: p.type ?? null,
    options: (p.options ?? []).map((o) => ({ name: o.name, type: o.type ?? null })),
  };
}

function collect(node, prefix, out, kind) {
  const name = node.name ?? node.textRaw ?? '?';
  const currentPath = prefix ? `${prefix}.${name}` : name;
  if (kind) {
    out.push({
      path: currentPath,
      kind,
      meta: node.meta ?? null,
      signatures: (node.signatures ?? []).map((s) => ({
        params: (s.params ?? []).map(flatParam),
        return: s.return?.type ?? null,
      })),
    });
  }
  for (const m of node.methods ?? []) collect(m, currentPath, out, 'method');
  for (const c of node.classes ?? []) collect(c, currentPath, out, 'class');
  for (const c of node.classMethods ?? []) collect(c, currentPath, out, 'staticMethod');
  for (const p of node.properties ?? []) collect(p, currentPath, out, 'property');
  for (const s of node.modules ?? []) collect(s, prefix, out, null);
  for (const s of node.miscs ?? []) collect(s, prefix, out, null);
  return out;
}

function extractOptionKeys(item) {
  const keys = new Set();
  for (const sig of item.signatures ?? []) {
    for (const p of sig.params ?? []) {
      for (const o of p.options ?? []) {
        if (o.name) keys.add(o.name);
      }
      if (p.name === 'signal') {
        keys.add('signal(positional)');
      }
    }
  }
  return [...keys].sort();
}

function normalizeKey(mod, rawPath) {
  const parts = rawPath.split('.');
  if (parts.length === 0) return rawPath;

  let lead = parts[0].toLowerCase();
  if (ROOT_SECTION_ALIASES[lead]) {
    lead = ROOT_SECTION_ALIASES[lead];
  } else if (lead === mod.toLowerCase()) {
    lead = mod;
  }
  parts[0] = lead;

  if (parts.length > 1 && parts[0] === mod && parts[1].toLowerCase() === mod.toLowerCase()) {
    parts.splice(0, 1);
  }

  return parts.join('.');
}

function buildLock(versions, docsByMajor) {
  const lock = {
    generatedFrom: {},
    modules: {},
  };

  for (const maj of TRACKED_MAJORS) {
    if (versions[maj]) {
      lock.generatedFrom[String(maj)] = versions[maj].version;
    }
  }

  const sortedMods = [...COVERED_MODULES].sort();

  for (const mod of sortedMods) {
    lock.modules[mod] = {};

    const itemsByPath = new Map();

    for (const maj of TRACKED_MAJORS) {
      const doc = docsByMajor[maj]?.[mod];
      if (!doc || doc.__missing) continue;

      const rawItems = [];
      for (const m of doc.modules ?? []) collect(m, '', rawItems, null);
      for (const m of doc.miscs ?? []) collect(m, '', rawItems, null);

      const majorItemsByNormPath = new Map();

      for (const rawItem of rawItems) {
        const normPath = normalizeKey(mod, rawItem.path);
        const existing = majorItemsByNormPath.get(normPath);
        if (!existing) {
          majorItemsByNormPath.set(normPath, rawItem);
        } else {
          if (!existing.meta && rawItem.meta) {
            majorItemsByNormPath.set(normPath, {
              ...rawItem,
              signatures: [...(existing.signatures ?? []), ...(rawItem.signatures ?? [])],
            });
          } else {
            existing.signatures = [...(existing.signatures ?? []), ...(rawItem.signatures ?? [])];
          }
        }
      }

      for (const [normPath, item] of majorItemsByNormPath) {
        if (!itemsByPath.has(normPath)) {
          itemsByPath.set(normPath, {
            normPath,
            kind: item.kind,
            presentIn: [],
            metaPerMajor: {},
            optionKeysPerMajor: {},
          });
        }
        const record = itemsByPath.get(normPath);
        record.presentIn.push(maj);
        const optKeys = extractOptionKeys(item);
        if (optKeys.length > 0) {
          record.optionKeysPerMajor[String(maj)] = optKeys;
        }
        if (item.meta) {
          record.metaPerMajor[String(maj)] = item.meta;
        }
      }
    }

    const sortedPaths = [...itemsByPath.keys()].sort();

    for (const normPath of sortedPaths) {
      const record = itemsByPath.get(normPath);

      let added = null;
      for (let i = TRACKED_MAJORS.length - 1; i >= 0; i--) {
        const maj = String(TRACKED_MAJORS[i]);
        const meta = record.metaPerMajor[maj];
        if (meta?.added) {
          added = Array.isArray(meta.added) ? meta.added[0] : String(meta.added);
          break;
        }
      }

      const signalIn = [];
      for (const maj of record.presentIn) {
        const keys = record.optionKeysPerMajor[String(maj)] ?? [];
        if (keys.includes('signal') || keys.includes('signal(positional)')) {
          signalIn.push(maj);
        }
      }

      lock.modules[mod][normPath] = {
        presentIn: record.presentIn,
        added,
        signalIn,
        optionKeys: record.optionKeysPerMajor,
      };
    }
  }

  return lock;
}

function findDiff(expected, actual, path = '') {
  if (expected === actual) return null;
  if (typeof expected !== typeof actual) {
    return `${path || 'root'}: expected ${typeof expected} ${JSON.stringify(expected)}, got ${typeof actual} ${JSON.stringify(actual)}`;
  }
  if (typeof expected !== 'object' || expected === null || actual === null) {
    return `${path || 'root'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }

  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return `${path || 'root'}: array mismatch`;
  }

  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      return `${path || 'root'}: length expected ${expected.length}, got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const d = findDiff(expected[i], actual[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }

  const expKeys = Object.keys(expected).sort();
  const actKeys = Object.keys(actual).sort();

  for (const k of expKeys) {
    if (!(k in actual)) {
      return `${path ? `${path}.${k}` : k}: missing in actual`;
    }
    const d = findDiff(expected[k], actual[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }

  for (const k of actKeys) {
    if (!(k in expected)) {
      return `${path ? `${path}.${k}` : k}: unexpected key in actual`;
    }
  }

  return null;
}

async function main() {
  const isCheckMode = process.argv.includes('--check');

  const versions = await resolveLatestPerMajor(TRACKED_MAJORS, isCheckMode);

  const docsByMajor = {};
  for (const maj of TRACKED_MAJORS) {
    docsByMajor[maj] = {};
    const v = versions[maj]?.version;
    if (!v) continue;
    for (const mod of COVERED_MODULES) {
      docsByMajor[maj][mod] = await fetchDoc(v, mod, isCheckMode);
    }
  }

  const projection = buildLock(versions, docsByMajor);
  const formatted = await prettier.format(JSON.stringify(projection, null, 2) + '\n', {
    filepath: LOCK_FILE,
  });

  if (isCheckMode) {
    if (!(await pathExists(LOCK_FILE))) {
      console.error(`Check failed: lock file not found at ${LOCK_FILE}`);
      process.exit(1);
    }
    const committed = JSON.parse(await readFile(LOCK_FILE, 'utf8'));
    const diff = findDiff(committed, projection);
    if (diff) {
      console.error(`Check failed: node-api.lock.json mismatch at ${diff}`);
      process.exit(1);
    }
    console.log('node-api.lock.json is up to date');
    process.exit(0);
  }

  await mkdir(dirname(LOCK_FILE), { recursive: true });
  await writeFile(LOCK_FILE, formatted, 'utf8');

  const byteSize = Buffer.byteLength(formatted, 'utf8');
  const modCount = Object.keys(projection.modules).length;
  console.log(`Written node-api.lock.json: ${byteSize} bytes, ${modCount} modules`);
}

await main();
