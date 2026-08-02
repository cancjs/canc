// Validates a commit message against the repo's one-line subject format.
// Runs as a lefthook commit-msg command: node scripts/check-commit-msg.js <msg-file>
//
// Usage: node scripts/check-commit-msg.js <commit-msg-file>

const fs = require('fs');

const SUBJECT_RE = /^\([a-z]+\) [A-Z].{0,68}$/;

const file = process.argv[2];

if (!file) {
  console.error('usage: node scripts/check-commit-msg.js <commit-msg-file>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');

// Git comment lines (only present with commit -v or a configured template) and the trailing
// newline don't count toward the line total.
const lines = raw.split('\n').filter((line) => !line.startsWith('#'));

while (lines.length > 0 && lines[lines.length - 1] === '') {
  lines.pop();
}

if (lines.length === 0) {
  console.error('commit message is empty');
  process.exit(1);
}

if (lines.length > 1) {
  console.error('commit message must be a single line, got:');
  console.error(raw);
  process.exit(1);
}

const [subject] = lines;

if (!SUBJECT_RE.test(subject)) {
  console.error(`commit subject does not match "(scope) Subject" format: ${subject}`);
  process.exit(1);
}

process.exit(0);
