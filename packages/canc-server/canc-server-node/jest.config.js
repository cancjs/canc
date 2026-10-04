const path = require('path');
const memberConfig = require('../jest.config.server')(require('./package.json'));

// Host for the two family suites lerna cannot reach on its own, the shared core in packages/_server
// and the smoke spec one directory up. Neither carries a package.json, so neither is a workspace and
// `lerna run test` never visits them; this member lists them as extra jest projects the same way
// canc-toolbox hosts the _toolbox specs. The node adapter is the host because it is the layer the
// other four wire through, and because nothing here needs a build.
//
// Each project keeps its own config file, so a focused
// `npx jest -c packages/_server/jest.config.js` still behaves exactly as before.
module.exports = {
  ...memberConfig,
  rootDir: __dirname,
  projects: [
    { ...memberConfig, rootDir: __dirname },
    path.join(__dirname, '..', '..', '_server'),
    path.join(__dirname, '..'),
  ],
};
