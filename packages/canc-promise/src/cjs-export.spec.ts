import path from 'path';

describe('CommonJS default export interop', () => {
  it('exports default as module.exports for default-export packages', () => {
    const promisePath = path.resolve(__dirname, '../dist/index.cjs');
    const fetchPath = path.resolve(__dirname, '../../canc-fetch/dist/index.cjs');
    const axiosPath = path.resolve(__dirname, '../../canc-axios/dist/index.cjs');

    const CP = require(promisePath);
    const ft = require(fetchPath);
    const ax = require(axiosPath);

    expect(typeof CP).toBe('function');
    expect(typeof CP.default).toBe('function');
    expect(CP.default).toBe(CP);
    expect(typeof CP.CancelError).toBe('function');
    expect(CP.__esModule).toBe(true);

    expect(typeof ft).toBe('function');
    expect(typeof ft.default).toBe('function');
    expect(ft.default).toBe(ft);
    expect(typeof ft.cancelableFetchLater).toBe('function');
    expect(ft.__esModule).toBe(true);

    expect(typeof ax).toBe('function');
    expect(typeof ax.default).toBe('function');
    expect(ax.default).toBe(ax);
    expect(typeof ax.wrapAxios).toBe('function');
    expect(ax.__esModule).toBe(true);
  });

  it('keeps named-only packages as plain objects', () => {
    const tbPath = path.resolve(__dirname, '../../canc-toolbox/dist/index.cjs');
    const tbnPath = path.resolve(__dirname, '../../canc-toolbox-native/dist/index.cjs');
    const coPath = path.resolve(__dirname, '../../canc-coroutine/dist/index.cjs');
    const decPath = path.resolve(__dirname, '../../canc-decorators/dist/index.cjs');

    const tb = require(tbPath);
    const tbn = require(tbnPath);
    const co = require(coPath);
    const dec = require(decPath);

    expect(typeof tb).toBe('object');
    expect(typeof tbn).toBe('object');
    expect(typeof co).toBe('object');
    expect(typeof dec).toBe('object');
  });
});
