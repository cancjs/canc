import { AsyncMethod as LegacyEntryAsyncMethod, BindMethod as LegacyEntryBindMethod } from './legacy';
import { AsyncMethod as BabelLegacyEntryAsyncMethod, BindMethod as BabelLegacyEntryBindMethod } from './babel-legacy';
import { LegacyAsyncMethod, LegacyBindMethod } from './decorators-legacy';
import { BabelLegacyAsyncMethod, BabelLegacyBindMethod } from './decorators-babel-legacy';

/**
 * The `/legacy` and `/babel-legacy` subpaths re-export each flavor under the canonical
 * `AsyncMethod`/`BindMethod` names so switching toolchains only means switching the import path.
 */

describe('legacy subpath', () => {
 it('exports AsyncMethod as the same function as LegacyAsyncMethod', () => {
 expect(LegacyEntryAsyncMethod).toBe(LegacyAsyncMethod);
 });

 it('exports BindMethod as the same function as LegacyBindMethod', () => {
 expect(LegacyEntryBindMethod).toBe(LegacyBindMethod);
 });
});

describe('babel-legacy subpath', () => {
 it('exports AsyncMethod as the same function as BabelLegacyAsyncMethod', () => {
 expect(BabelLegacyEntryAsyncMethod).toBe(BabelLegacyAsyncMethod);
 });

 it('exports BindMethod as the same function as BabelLegacyBindMethod', () => {
 expect(BabelLegacyEntryBindMethod).toBe(BabelLegacyBindMethod);
 });
});
