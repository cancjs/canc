// Babel config for the babel-legacy IssueClient flavor. Legacy decorators produce the
// method/getter descriptor shapes @cancjs/decorators/babel-legacy expects. Scoped to this
// subfolder so it only governs the .js flavor; the TS flavors compile via ts-jest.
module.exports = {
 presets: [
 ['@babel/preset-env', { targets: { node: 'current' } }],
 ],
 plugins: [
 ['@babel/plugin-proposal-decorators', { legacy: true }],
 ],
};
