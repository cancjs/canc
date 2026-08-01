// Pinia's devtools integration is dev-tooling only; the store behavior under test never depends
// on it. @vue/devtools-api (and its @vue/devtools-kit -> perfect-debounce dependency chain) ships
// ESM-only with no jest-friendly path, so it is stubbed out here instead of transformed.
module.exports = {
  setupDevtoolsPlugin: () => {},
};
