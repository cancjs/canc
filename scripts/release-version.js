// Versions packages via changesets while keeping manifests formatted and lockfile refreshed.
const { execSync } = require('child_process');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

run('npx changeset version');
run('npm install --package-lock-only');
run('npx prettier --write "packages/*/package.json" "packages/canc-server/*/package.json" package.json');
