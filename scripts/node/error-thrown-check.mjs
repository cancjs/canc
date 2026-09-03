// Flags an exported *Error class never constructed in production src
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

function collectFiles(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
}

const files = [];
collectFiles(join(root, 'packages'), files);

// value-level shapes only, so type aliases, isFooError guards, and node re-exports never match
const DECL_PATTERNS = [
  /^\s*export\s+class\s+([A-Z]\w*Error)\b/,
  /^\s*export\s+const\s+([A-Z]\w*Error)\s*(?::[^=]+)?=\s*createErrorClass\(/,
  /^\s*export\s+const\s+([A-Z]\w*Error)\s*:\s*I\w*Constructor\s*=/,
];

// name -> { file, lineIndex (0-based) }
const declarations = new Map();
const rawLines = new Map();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  rawLines.set(file, lines);
  lines.forEach((line, idx) => {
    for (const re of DECL_PATTERNS) {
      const m = re.exec(line);
      if (m && !declarations.has(m[1])) {
        declarations.set(m[1], { file, lineIndex: idx });
      }
    }
  });
}

// blanks imports, export forwarding/type statements, and comments; keeps newlines for line count
function blank(text, re) {
  return text.replace(re, (m) => m.replace(/[^\n]/g, ' '));
}

function maskNonUsage(text) {
  let out = text;
  out = blank(out, /\/\*[\s\S]*?\*\//g);
  out = blank(out, /\/\/[^\n]*/g);
  out = blank(out, /import\s+[\s\S]*?from\s*['"][^'"]*['"]\s*;?/g);
  out = blank(out, /import\s*['"][^'"]*['"]\s*;?/g);
  out = blank(out, /export\s*\*\s*from\s*['"][^'"]*['"]\s*;?/g);
  out = blank(out, /export\s*\{[\s\S]*?\}\s*(?:from\s*['"][^'"]*['"])?\s*;?/g);
  out = blank(out, /export\s+type\s+[\s\S]*?;/g);
  return out;
}

const maskedLines = new Map();
for (const file of files) {
  maskedLines.set(file, maskNonUsage(rawLines.get(file).join('\n')).split('\n'));
}

let failed = false;
const unthrown = [];

for (const [name, decl] of declarations) {
  const wordRe = new RegExp(`\\b${name}\\b`);
  let used = false;

  outer: for (const file of files) {
    const lines = maskedLines.get(file);
    for (let i = 0; i < lines.length; i++) {
      if (file === decl.file && i === decl.lineIndex) continue; // its own declaration line
      if (wordRe.test(lines[i])) {
        used = true;
        break outer;
      }
    }
  }

  if (!used) {
    failed = true;
    unthrown.push(name);
    console.error(
      `Check H failed: ${name} (declared ${relative(root, decl.file)}:${decl.lineIndex + 1}) is exported but never constructed in src/ outside specs`,
    );
  }
}

if (failed) {
  console.error(`Check H failed: unthrown error class${unthrown.length > 1 ? 'es' : ''}: ${unthrown.join(', ')}`);
  process.exit(1);
} else {
  console.log(`Check H passed: ${declarations.size} exported error classes all constructed`);
  process.exit(0);
}
