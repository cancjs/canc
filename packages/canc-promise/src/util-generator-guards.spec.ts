import { assertGeneratorResult, assertStepResult } from '../../_util';

describe('generator result and step guards', () => {
  describe('assertGeneratorResult', () => {
    it('rejects native async generator object with TypeError naming context', () => {
      const asyncGen = (async function* () {
        yield 1;
      })();

      expect(() => assertGeneratorResult(asyncGen, 'testContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(asyncGen, 'testContext')).toThrow('testContext');
      expect(() => assertGeneratorResult(asyncGen, 'testContext')).toThrow(/async generator/i);
    });

    it('rejects transpiled async generator object with TypeError naming context', () => {
      const transpiledAsyncGen = {
        next: () => Promise.resolve({ value: 1, done: false }),
        [Symbol.asyncIterator]: () => transpiledAsyncGen,
      };

      expect(() => assertGeneratorResult(transpiledAsyncGen, 'transpiledContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(transpiledAsyncGen, 'transpiledContext')).toThrow('transpiledContext');
      expect(() => assertGeneratorResult(transpiledAsyncGen, 'transpiledContext')).toThrow(/async generator/i);
    });

    it('rejects generator-like object missing return method with TypeError naming context', () => {
      const noReturnGen = {
        next: () => ({ value: 1, done: false }),
      };

      expect(() => assertGeneratorResult(noReturnGen, 'noReturnContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(noReturnGen, 'noReturnContext')).toThrow('noReturnContext');
      expect(() => assertGeneratorResult(noReturnGen, 'noReturnContext')).toThrow(/return/i);
    });

    it('rejects non-callable return on generator-like object', () => {
      const badReturnGen = {
        next: () => ({ value: 1, done: false }),
        return: 123,
      };

      expect(() => assertGeneratorResult(badReturnGen, 'badReturnContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(badReturnGen, 'badReturnContext')).toThrow('badReturnContext');
      expect(() => assertGeneratorResult(badReturnGen, 'badReturnContext')).toThrow(/return/i);
    });

    it('rejects non-generator values with TypeError naming context', () => {
      expect(() => assertGeneratorResult(null, 'nullContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(null, 'nullContext')).toThrow('nullContext');

      expect(() => assertGeneratorResult(undefined, 'undefinedContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(123, 'numberContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult('string', 'stringContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult({}, 'emptyObjContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(Promise.resolve({}), 'promiseContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(() => {}, 'fnContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(() => {}, 'fnContext')).toThrow('fnContext');
      expect(() => assertGeneratorResult(() => {}, 'fnContext')).toThrow(/a function/);
    });

    it('passes synchronous generator instance', () => {
      function* syncGen() {
        yield 1;
        return 2;
      }

      const gen = syncGen();
      expect(() => assertGeneratorResult(gen, 'syncContext')).not.toThrow();
    });

    it('rejects generator-like object missing throw method with TypeError naming context', () => {
      const noThrowGen = {
        next: () => ({ value: 1, done: false }),
        return: () => ({ value: undefined, done: true }),
      };

      expect(() => assertGeneratorResult(noThrowGen, 'noThrowContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(noThrowGen, 'noThrowContext')).toThrow('noThrowContext');
      expect(() => assertGeneratorResult(noThrowGen, 'noThrowContext')).toThrow(/throw/i);
    });

    it('rejects non-callable throw on generator-like object', () => {
      const badThrowGen = {
        next: () => ({ value: 1, done: false }),
        return: () => ({ value: undefined, done: true }),
        throw: 123,
      };

      expect(() => assertGeneratorResult(badThrowGen, 'badThrowContext')).toThrow(TypeError);
      expect(() => assertGeneratorResult(badThrowGen, 'badThrowContext')).toThrow('badThrowContext');
      expect(() => assertGeneratorResult(badThrowGen, 'badThrowContext')).toThrow(/throw/i);
    });

    it('passes custom generator-like with callable next, return, and throw', () => {
      const customGen = {
        next: () => ({ value: 1, done: false }),
        return: () => ({ value: undefined, done: true }),
        throw: () => ({ value: undefined, done: true }),
      };

      expect(() => assertGeneratorResult(customGen, 'customContext')).not.toThrow();
    });
  });

  describe('assertStepResult', () => {
    it('rejects thenable step result with TypeError naming context', () => {
      const promiseStep = Promise.resolve({ value: 1, done: false });

      expect(() => assertStepResult(promiseStep, 'stepPromiseContext')).toThrow(TypeError);
      expect(() => assertStepResult(promiseStep, 'stepPromiseContext')).toThrow('stepPromiseContext');
      expect(() => assertStepResult(promiseStep, 'stepPromiseContext')).toThrow(/promise|thenable/i);
    });

    it('rejects non-object step result with TypeError naming context', () => {
      expect(() => assertStepResult(null, 'stepNullContext')).toThrow(TypeError);
      expect(() => assertStepResult(null, 'stepNullContext')).toThrow('stepNullContext');

      expect(() => assertStepResult(undefined, 'stepUndefinedContext')).toThrow(TypeError);
      expect(() => assertStepResult(42, 'stepNumberContext')).toThrow(TypeError);
      expect(() => assertStepResult('done', 'stepStringContext')).toThrow(TypeError);
    });

    it('passes valid iterator step object with value and done', () => {
      expect(() => assertStepResult({ value: 1, done: false }, 'stepContext')).not.toThrow();
      expect(() => assertStepResult({ value: undefined, done: true }, 'stepContext')).not.toThrow();
      expect(() => assertStepResult({ value: 'hello' }, 'stepContext')).not.toThrow();
    });
  });
});
