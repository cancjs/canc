// Checks relative links and image srcs in markdown/mdx-ish files for dead targets.
// Skips absolute URLs (http/https/mailto) and in-page anchors (#foo) — those need a live
// renderer or network access to verify and aren't what this check is for.
//
// Usage: node scripts/check-links.js <file...>

const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);

if (files.length === 0) {
 console.error('usage: node scripts/check-links.js <file...>');
 process.exit(1);
}

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)|<img\s+[^>]*src="([^"]+)"|<a\s+[^>]*href="([^"]+)"/g;

let deadCount = 0;
let checkedCount = 0;

for (const file of files) {
 const absFile = path.resolve(file);
 const dir = path.dirname(absFile);
 const content = fs.readFileSync(absFile, 'utf8');

 let match;
 while ((match = LINK_RE.exec(content))) {
 const target = match[1] || match[2] || match[3];
 if (!target) continue;
 if (/^([a-z]+:)?\/\//i.test(target) || target.startsWith('mailto:') || target.startsWith('#')) {
 continue; // absolute URL or in-page anchor, not a relative link
 }

 checkedCount++;
 const [targetPath] = target.split('#');
 if (!targetPath) continue; // pure anchor into the same file, already skipped above
 const resolved = path.resolve(dir, targetPath);

 if (!fs.existsSync(resolved)) {
 deadCount++;
 console.log(`DEAD ${file}: ${target} -> ${resolved}`);
 }
 }
}

console.log(`checked ${checkedCount} relative link(s) across ${files.length} file(s), ${deadCount} dead`);
process.exit(deadCount > 0 ? 1 : 0);
