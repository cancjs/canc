const path = require('path');
const glob = require('glob');
const base = require('./jest.config.base.js');

// app-vue-pinia's own jest.config.js exports a `projects` array (one project per flavor). Jest
// rejects a `projects` key inside an individual project config, so it cannot be picked up by the
// plain glob below like every other example config; require it directly and splice its two
// projects into this root array instead. Its `rootDir: '.'` resolves relative to app-vue-pinia
// when jest runs standalone there, so point it at the app dir explicitly here.
const vuePiniaProjects = require('./app-vue-pinia/jest.config.js').projects.map((project) => ({
 ...project,
 rootDir: path.join(__dirname, 'app-vue-pinia'),
}));

// Every other example with an own jest.config.js is a normal single-project config and can be
// picked up by glob. demo-combinators and demo-signal-interop have specs but no own config, so
// they get an inline project each; the workspace-root specs under test/ get one too.
const ownConfigs = glob
 .sync('*/jest.config.js', { cwd: __dirname })
 .filter((p) => p.split(path.sep).join('/') !== 'app-vue-pinia/jest.config.js')
 .map((p) => path.join('<rootDir>', p));

module.exports = {
 projects: [
 ...ownConfigs,
 ...vuePiniaProjects,
 {
 ...base,
 displayName: 'demo-combinators',
 rootDir: 'demo-combinators',
 },
 {
 ...base,
 displayName: 'demo-signal-interop',
 rootDir: 'demo-signal-interop',
 },
 {
 ...base,
 displayName: 'examples-root',
 rootDir: '.',
 testMatch: ['<rootDir>/test/**/*.spec.ts'],
 // base's @shared mapper assumes rootDir is one level under examples/ (a per-app dir); this
 // project's rootDir IS examples/, so @shared resolves directly to ./_shared, not ../_shared.
 moduleNameMapper: {
 ...base.moduleNameMapper,
 '^@shared/(.+)$': '<rootDir>/_shared/$1',
 },
 },
 ],
};
