// leak canaries only, run by `npm run test:canary` in one process with --expose-gc
module.exports = {
  // canc-decorators nests its own projects, which jest refuses one level down
  projects: ['<rootDir>/packages/!(canc-decorators)/jest.config.js'],
};
