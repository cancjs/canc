// Runs by CI, cron, or hand.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SURFACE_DIR = join(ROOT, 'packages', 'canc-node', 'surface');

const ALLOWED_STATUSES = new Set(['supported', 'planned', 'deferred', 'excluded']);
const ALLOWED_KINDS = new Set(['fn', 'class', 'const', 'type', 'namespace']);
const ALLOWED_CANCEL_CATEGORIES = new Set(['A', 'B', 'C', 'D', null]);
const ALLOWED_CALL_PATHS = new Set(['callback', 'promises', 'sync', null]);
const ALLOWED_WRAPPERS = new Set([
  'cancelify-signal',
  'cancelify-teardown',
  'constructor-teardown',
  'promisify-custom',
  'promisify-callback',
  'reimplemented',
  'passthrough',
  'gated',
]);
const ALLOWED_GATES = new Set(['feature-detect', 'throw', 'polyfill', null]);

const REQUIRED_EXPORT_FIELDS = [
  'name',
  'kind',
  'cancelCategory',
  'callPath',
  'nodeSignal',
  'wrapper',
  'failures',
  'minMajor',
  'gate',
  'runtime',
];

// 'nodeSpecifier' overrides the manifest's own specifier for one export, for a member reached
// through a submodule the manifest is not named after (node:stream/consumers under stream).
const ALLOWED_EXPORT_FIELDS = new Set([
  ...REQUIRED_EXPORT_FIELDS,
  'teardown',
  'notes',
  'probed',
  'nodeSpecifier',
  'parent',
]);

const REQUIRED_SIGNAL_FIELDS = ['documented', 'since', 'probed'];
const ALLOWED_SIGNAL_FIELDS = new Set([...REQUIRED_SIGNAL_FIELDS, 'sinceByMajor']);

const REQUIRED_ROOT_FIELDS = ['subpath', 'nodeSpecifier', 'status', 'exports'];
const ALLOWED_ROOT_FIELDS = new Set([...REQUIRED_ROOT_FIELDS, '$schema']);

export async function validateManifest(manifest, filename, nodeLock = null) {
  const errors = [];
  const addErr = (expName, field, msg) => {
    const loc = expName ? `export "${expName}" field "${field}"` : `field "${field}"`;
    errors.push(`${filename}: ${loc} - ${msg}`);
  };

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [`${filename}: manifest must be a JSON object`];
  }

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (manifest[field] === undefined) {
      addErr(null, field, 'missing required root field');
    }
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_ROOT_FIELDS.has(key)) {
      addErr(null, key, `unknown root field "${key}"`);
    }
  }

  if (typeof manifest.subpath !== 'string') {
    addErr(null, 'subpath', 'must be a string');
  }
  if (manifest.nodeSpecifier !== null && typeof manifest.nodeSpecifier !== 'string') {
    addErr(null, 'nodeSpecifier', 'must be a string or null');
  }
  if (!ALLOWED_STATUSES.has(manifest.status)) {
    addErr(null, 'status', `invalid status "${manifest.status}", expected one of: ${[...ALLOWED_STATUSES].join(', ')}`);
  }
  if (!Array.isArray(manifest.exports)) {
    addErr(null, 'exports', 'must be an array');
    return errors;
  }

  for (let i = 0; i < manifest.exports.length; i++) {
    const exp = manifest.exports[i];
    const expName = exp?.name || `[index ${i}]`;

    if (!exp || typeof exp !== 'object' || Array.isArray(exp)) {
      addErr(expName, 'entry', 'must be an object');
      continue;
    }

    for (const field of REQUIRED_EXPORT_FIELDS) {
      if (exp[field] === undefined) {
        addErr(expName, field, 'missing required field');
      }
    }

    for (const key of Object.keys(exp)) {
      if (!ALLOWED_EXPORT_FIELDS.has(key)) {
        addErr(expName, key, `unknown export field "${key}"`);
      }
    }

    if (typeof exp.name !== 'string' || exp.name.length === 0) {
      addErr(expName, 'name', 'must be a non-empty string');
    }
    if (!ALLOWED_KINDS.has(exp.kind)) {
      addErr(expName, 'kind', `invalid kind "${exp.kind}", expected one of: ${[...ALLOWED_KINDS].join(', ')}`);
    }
    if (!ALLOWED_CANCEL_CATEGORIES.has(exp.cancelCategory)) {
      addErr(expName, 'cancelCategory', `invalid cancelCategory "${exp.cancelCategory}", expected A, B, C, D, or null`);
    }
    if (exp.callPath !== undefined && !ALLOWED_CALL_PATHS.has(exp.callPath)) {
      addErr(expName, 'callPath', `invalid callPath "${exp.callPath}", expected callback, promises, or null`);
    }
    if (!ALLOWED_WRAPPERS.has(exp.wrapper)) {
      addErr(
        expName,
        'wrapper',
        `invalid wrapper "${exp.wrapper}", expected one of: ${[...ALLOWED_WRAPPERS].join(', ')}`,
      );
    }

    if (!exp.nodeSignal || typeof exp.nodeSignal !== 'object' || Array.isArray(exp.nodeSignal)) {
      addErr(expName, 'nodeSignal', 'must be an object');
    } else {
      for (const field of REQUIRED_SIGNAL_FIELDS) {
        if (exp.nodeSignal[field] === undefined) {
          addErr(expName, `nodeSignal.${field}`, 'missing required field in nodeSignal');
        }
      }
      for (const key of Object.keys(exp.nodeSignal)) {
        if (!ALLOWED_SIGNAL_FIELDS.has(key)) {
          addErr(expName, `nodeSignal.${key}`, `unknown field in nodeSignal "${key}"`);
        }
      }
      if (typeof exp.nodeSignal.documented !== 'boolean') {
        addErr(expName, 'nodeSignal.documented', 'must be a boolean');
      }
      if (exp.nodeSignal.since !== null && typeof exp.nodeSignal.since !== 'string') {
        addErr(expName, 'nodeSignal.since', 'must be a string or null');
      }
      if (exp.nodeSignal.probed !== null && typeof exp.nodeSignal.probed !== 'string') {
        addErr(expName, 'nodeSignal.probed', 'must be a string or null');
      }
      if (exp.nodeSignal.sinceByMajor !== undefined && exp.nodeSignal.sinceByMajor !== null) {
        if (typeof exp.nodeSignal.sinceByMajor !== 'object' || Array.isArray(exp.nodeSignal.sinceByMajor)) {
          addErr(expName, 'nodeSignal.sinceByMajor', 'must be an object or null');
        } else {
          for (const [maj, ver] of Object.entries(exp.nodeSignal.sinceByMajor)) {
            if (!/^[0-9]+$/.test(maj)) {
              addErr(expName, 'nodeSignal.sinceByMajor', `invalid major key "${maj}", must be numeric`);
            }
            if (typeof ver !== 'string' || ver.length === 0) {
              addErr(expName, 'nodeSignal.sinceByMajor', `value for major "${maj}" must be a non-empty string`);
              continue;
            }

            // a value must lie on the major line it is filed under
            // the map exists to record a backport, 18 getting v18.18.0 while 20 got v20.5.0
            // checking only that the key is present left a wrong-line version invisible
            // a version below the key's line is fine, the feature predates that major
            const verMajor = Number(/^v(\d+)\./.exec(ver)?.[1]);
            if (Number.isNaN(verMajor)) {
              addErr(expName, 'nodeSignal.sinceByMajor', `value "${ver}" for major "${maj}" is not a vX.Y.Z version`);
            } else if (verMajor > Number(maj)) {
              addErr(
                expName,
                'nodeSignal.sinceByMajor',
                `value "${ver}" for major "${maj}" is from a later major, so it cannot be when ${maj} got it`,
              );
            }
          }
        }
      }

      if (nodeLock && exp.nodeSignal.documented) {
        const base = manifest.subpath.split('#')[0];
        const specMod = manifest.nodeSpecifier ? manifest.nodeSpecifier.replace(/^node:/, '').split('/')[0] : null;
        const unhyphenated = base.replace(/-/g, '_');
        const mod =
          nodeLock.modules[base] ? base
          : specMod && nodeLock.modules[specMod] ? specMod
          : nodeLock.modules[unhyphenated] ? unhyphenated
          : base;
        const isHandle = manifest.subpath.includes('#FileHandle');
        const lockKey = isHandle ? `promises_api.FileHandle.${exp.name}` : `promises_api.${exp.name}`;
        let lockEntry = nodeLock.modules?.[mod]?.[lockKey];
        if (!lockEntry && nodeLock.modules?.[mod]) {
          const found = Object.entries(nodeLock.modules[mod]).find(([k]) => {
            const p = k.split('.');
            return p[p.length - 1] === exp.name;
          });
          if (found) lockEntry = found[1];
        }
        const signalMajors = lockEntry?.signalIn || [];

        const sinceVer = exp.nodeSignal.since;
        const isPreFloor = typeof sinceVer === 'string' && /^[vV]?(\d+)/.test(sinceVer) && parseInt(RegExp.$1, 10) < 18;

        if (!isPreFloor && signalMajors.length > 0) {
          if (!exp.nodeSignal.sinceByMajor || typeof exp.nodeSignal.sinceByMajor !== 'object') {
            addErr(
              expName,
              'nodeSignal.sinceByMajor',
              `missing sinceByMajor object for signalIn [${signalMajors.join(', ')}]`,
            );
          } else {
            for (const maj of signalMajors) {
              if (exp.nodeSignal.sinceByMajor[String(maj)] === undefined) {
                addErr(
                  expName,
                  'nodeSignal.sinceByMajor',
                  `major "${maj}" from lock signalIn [${signalMajors.join(', ')}] is absent in sinceByMajor`,
                );
              }
            }
          }
        }
      }
    }

    if (!Array.isArray(exp.failures)) {
      addErr(expName, 'failures', 'must be an array of strings');
    } else {
      for (const f of exp.failures) {
        if (typeof f !== 'string') {
          addErr(expName, 'failures', `failure code must be a string, got ${typeof f}`);
        }
      }
      if (exp.failures.length === 0) {
        if (!exp.notes || typeof exp.notes !== 'string' || exp.notes.trim() === '') {
          addErr(expName, 'failures', 'empty failures array requires an explicit explanatory note in "notes"');
        }
      }
    }

    if (exp.minMajor !== null && (!Number.isInteger(exp.minMajor) || exp.minMajor <= 0)) {
      addErr(expName, 'minMajor', 'must be a positive integer or null');
    }
    if (!ALLOWED_GATES.has(exp.gate)) {
      addErr(expName, 'gate', `invalid gate "${exp.gate}", expected feature-detect, throw, polyfill, or null`);
    }

    if (!exp.runtime || typeof exp.runtime !== 'object' || Array.isArray(exp.runtime)) {
      addErr(expName, 'runtime', 'must be an object with deno and bun status');
    } else {
      if (typeof exp.runtime.deno !== 'string' || exp.runtime.deno.length === 0) {
        addErr(expName, 'runtime.deno', 'must be a non-empty string');
      }
      if (typeof exp.runtime.bun !== 'string' || exp.runtime.bun.length === 0) {
        addErr(expName, 'runtime.bun', 'must be a non-empty string');
      }
    }

    if (exp.teardown !== undefined && exp.teardown !== null && typeof exp.teardown !== 'string') {
      addErr(expName, 'teardown', 'must be a string or null');
    }
    if (exp.parent !== undefined && (typeof exp.parent !== 'string' || exp.parent.trim() === '')) {
      addErr(expName, 'parent', 'must be a non-empty string');
    }
    if (exp.notes !== undefined && typeof exp.notes !== 'string') {
      addErr(expName, 'notes', 'must be a string');
    }
    // error code from a live cancel() probe, distinct from nodeSignal.probed (signal behavior)
    if (exp.probed !== undefined && exp.probed !== null && typeof exp.probed !== 'string') {
      addErr(expName, 'probed', 'must be a string or null');
    }
  }

  return errors;
}

export async function validateAll() {
  const entries = await readdir(SURFACE_DIR, { withFileTypes: true });
  const manifestFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .filter((name) => name !== 'schema.json' && !name.endsWith('.lock.json') && name !== 'exclusions.json');

  let nodeLock = null;
  try {
    const lockRaw = await readFile(join(SURFACE_DIR, 'node-api.lock.json'), 'utf8');
    nodeLock = JSON.parse(lockRaw);
  } catch (_err) {
    // node-api.lock.json may be absent in partial runs
  }

  const allErrors = [];
  let totalExports = 0;

  for (const file of manifestFiles) {
    const filePath = join(SURFACE_DIR, file);
    try {
      const content = await readFile(filePath, 'utf8');
      const json = JSON.parse(content);
      const errors = await validateManifest(json, file, nodeLock);
      if (errors.length > 0) {
        allErrors.push(...errors);
      } else {
        totalExports += json.exports?.length || 0;
      }
    } catch (err) {
      allErrors.push(`${file}: failed to parse JSON - ${err.message}`);
    }
  }

  if (allErrors.length > 0) {
    console.error(`Surface validation failed with ${allErrors.length} error(s):`);
    for (const err of allErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `Surface validation passed: ${manifestFiles.length} manifest file(s) checked, ${totalExports} exports validated.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  validateAll();
}
