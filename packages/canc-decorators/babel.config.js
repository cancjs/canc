// Babel fixture for the stage-3 decorators babel lane (babel-stage3/decorators.spec.ts). Proves
// our stage-3 flavor (@cancjs/decorators default export) works under babel's decorator transform
// (the vite/esbuild-adjacent ecosystem), not just native TS 5+ emit. Scoped to this package only;
// ts-jest handles every other spec file (see jest.config.js transform map).
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    // allowDeclareFields: the babel-stage3 project transforms every .ts file it touches,
    // including transitively-imported @cancjs/promise (cancelable-promise.ts uses
    // `static declare readonly [Symbol.species]`); without this, preset-typescript rejects any
    // `declare` class field as "must first be transformed by @babel/plugin-transform-typescript".
    ['@babel/preset-typescript', { allowDeclareFields: true }],
  ],
  plugins: [
    // Stage-3 decorators apply their own class-elements handling; @babel/plugin-transform-class-
    // properties is only needed for LEGACY decorators and actively breaks stage-3 parsing if
    // included alongside it (confirmed empirically against @babel/core 7.29.7 — the combination
    // makes the parser reject `@` syntax entirely with a misleading "Decorators are not enabled").
    ['@babel/plugin-proposal-decorators', { version: '2023-05' }],
  ],
};
