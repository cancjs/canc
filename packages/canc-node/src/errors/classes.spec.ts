import {
  isJsonParseError,
  isNotImplementedError,
  isProcessExitError,
  isProcessSpawnError,
  JSON_PARSE_ERROR_BRAND,
  JsonParseError,
  NOT_IMPLEMENTED_ERROR_BRAND,
  NotImplementedError,
  PROCESS_EXIT_ERROR_BRAND,
  PROCESS_SPAWN_ERROR_BRAND,
  ProcessExitError,
  ProcessSpawnError,
} from './classes';

describe('package error classes and guards', () => {
  describe('NotImplementedError', () => {
    it('creates an instance with default message', () => {
      const error = new NotImplementedError();
      expect(error.message).toBe('The requested feature is not implemented');
      expect(error.feature).toBeUndefined();
      expect(error.required).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('creates an instance of Error and matches guard', () => {
      const error = new NotImplementedError('Feature not available');

      expect(error instanceof Error).toBe(true);
      expect(error).toBeInstanceOf(NotImplementedError);
      expect(error.name).toBe('NotImplementedError');
      expect(error.message).toBe('Feature not available');
      expect(isNotImplementedError(error)).toBe(true);
      expect(isNotImplementedError(new Error('Feature not available'))).toBe(false);
    });

    it('attaches feature, required version, and cause metadata', () => {
      const cause = new Error('inner');
      const error = new NotImplementedError('glob requires Node >= 22.0.0', {
        cause,
        feature: 'glob',
        required: '>= 22.0.0',
      });

      expect(error.feature).toBe('glob');
      expect(error.required).toBe('>= 22.0.0');
      expect(error.cause).toBe(cause);
    });

    it('matches an object with the brand symbol across realms', () => {
      const fakeProto = { [NOT_IMPLEMENTED_ERROR_BRAND]: true };
      const crossRealmObject = Object.create(fakeProto);

      expect(crossRealmObject instanceof Error).toBe(false);
      expect(isNotImplementedError(crossRealmObject)).toBe(true);
    });

    it('matches by name fallback', () => {
      expect(isNotImplementedError({ name: 'NotImplementedError' })).toBe(true);
      expect(isNotImplementedError({ name: 'OtherError' })).toBe(false);
    });
  });

  describe('ProcessExitError', () => {
    it('creates an instance with default message', () => {
      const error = new ProcessExitError();
      expect(error.message).toBe('Process exited with a non-zero exit code');
      expect(error.exitCode).toBeUndefined();
      expect(error.signal).toBeUndefined();
      expect(error.stdout).toBeUndefined();
      expect(error.stderr).toBeUndefined();
      expect(error.command).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('creates an instance of Error and matches guard', () => {
      const error = new ProcessExitError('Process failed');

      expect(error instanceof Error).toBe(true);
      expect(error).toBeInstanceOf(ProcessExitError);
      expect(error.name).toBe('ProcessExitError');
      expect(error.message).toBe('Process failed');
      expect(isProcessExitError(error)).toBe(true);
      expect(isProcessExitError(new Error('Process failed'))).toBe(false);
    });

    it('attaches exitCode, signal, stdout, stderr, command, and cause', () => {
      const cause = new Error('sub-cause');
      const error = new ProcessExitError('Command exited with code 1', {
        cause,
        command: 'node script.js',
        exitCode: 1,
        signal: null,
        stderr: 'error output',
        stdout: 'normal output',
      });

      expect(error.command).toBe('node script.js');
      expect(error.exitCode).toBe(1);
      expect(error.signal).toBeNull();
      expect(error.stdout).toBe('normal output');
      expect(error.stderr).toBe('error output');
      expect(error.cause).toBe(cause);
    });

    it('carries the signal shape, with a null exit code, for a process killed by a signal', () => {
      const error = new ProcessExitError('Process was terminated by signal SIGTERM', {
        command: 'node script.js',
        exitCode: null,
        signal: 'SIGTERM',
      });

      expect(error.exitCode).toBeNull();
      expect(error.signal).toBe('SIGTERM');
    });

    it('matches an object with the brand symbol across realms', () => {
      const fakeProto = { [PROCESS_EXIT_ERROR_BRAND]: true };
      const crossRealmObject = Object.create(fakeProto);

      expect(crossRealmObject instanceof Error).toBe(false);
      expect(isProcessExitError(crossRealmObject)).toBe(true);
    });

    it('matches by name fallback', () => {
      expect(isProcessExitError({ name: 'ProcessExitError' })).toBe(true);
      expect(isProcessExitError({ name: 'OtherError' })).toBe(false);
    });
  });

  describe('ProcessSpawnError', () => {
    it('creates an instance with default message', () => {
      const error = new ProcessSpawnError();
      expect(error.message).toBe('Process could not be spawned');
      expect(error.code).toBeUndefined();
      expect(error.command).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('creates an instance of Error and matches guard', () => {
      const error = new ProcessSpawnError('Failed to spawn');

      expect(error instanceof Error).toBe(true);
      expect(error).toBeInstanceOf(ProcessSpawnError);
      expect(error.name).toBe('ProcessSpawnError');
      expect(error.message).toBe('Failed to spawn');
      expect(isProcessSpawnError(error)).toBe(true);
      expect(isProcessSpawnError(new Error('Failed to spawn'))).toBe(false);
    });

    it('attaches code, command, and cause metadata', () => {
      const cause = new Error('spawn-cause');
      const error = new ProcessSpawnError('Spawn failed', {
        cause,
        code: 'ENOENT',
        command: 'nonexistent-binary',
      });

      expect(error.code).toBe('ENOENT');
      expect(error.command).toBe('nonexistent-binary');
      expect(error.cause).toBe(cause);
    });

    it('matches an object with the brand symbol across realms', () => {
      const fakeProto = { [PROCESS_SPAWN_ERROR_BRAND]: true };
      const crossRealmObject = Object.create(fakeProto);

      expect(crossRealmObject instanceof Error).toBe(false);
      expect(isProcessSpawnError(crossRealmObject)).toBe(true);
    });

    it('matches by name fallback', () => {
      expect(isProcessSpawnError({ name: 'ProcessSpawnError' })).toBe(true);
      expect(isProcessSpawnError({ name: 'OtherError' })).toBe(false);
    });
  });

  describe('JsonParseError', () => {
    it('creates an instance with default message', () => {
      const error = new JsonParseError();
      expect(error.message).toBe('Failed to parse JSON');
      expect(error.path).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('creates an instance of Error and matches guard', () => {
      const error = new JsonParseError('Parse failed');

      expect(error instanceof Error).toBe(true);
      expect(error).toBeInstanceOf(JsonParseError);
      expect(error.name).toBe('JsonParseError');
      expect(error.message).toBe('Parse failed');
      expect(isJsonParseError(error)).toBe(true);
      expect(isJsonParseError(new Error('Parse failed'))).toBe(false);
    });

    it('preserves real SyntaxError cause from JSON.parse', () => {
      let syntaxError: unknown;
      try {
        JSON.parse('{');
      } catch (err) {
        syntaxError = err;
      }

      expect(syntaxError).toBeDefined();

      const error = new JsonParseError('Unexpected end of JSON input', {
        cause: syntaxError,
        path: '/tmp/package.json',
      });

      expect(error.cause).toBe(syntaxError);
      expect(error.path).toBe('/tmp/package.json');
    });

    it('accepts Error directly as second argument', () => {
      let syntaxError: unknown;
      try {
        JSON.parse('invalid json');
      } catch (err) {
        syntaxError = err;
      }

      const error = new JsonParseError('Failed to parse', syntaxError as Error);
      expect(error.cause).toBe(syntaxError);
    });

    it('matches an object with the brand symbol across realms', () => {
      const fakeProto = { [JSON_PARSE_ERROR_BRAND]: true };
      const crossRealmObject = Object.create(fakeProto);

      expect(crossRealmObject instanceof Error).toBe(false);
      expect(isJsonParseError(crossRealmObject)).toBe(true);
    });

    it('matches by name fallback', () => {
      expect(isJsonParseError({ name: 'JsonParseError' })).toBe(true);
      expect(isJsonParseError({ name: 'OtherError' })).toBe(false);
    });
  });

  describe('guards reject invalid input types', () => {
    it('rejects null, undefined, primitives, and plain objects', () => {
      const guards = [isNotImplementedError, isProcessExitError, isProcessSpawnError, isJsonParseError];

      for (const guard of guards) {
        expect(guard(null)).toBe(false);
        expect(guard(undefined)).toBe(false);
        expect(guard('error string')).toBe(false);
        expect(guard(42)).toBe(false);
        expect(guard(true)).toBe(false);
        expect(guard({})).toBe(false);
      }
    });
  });
});
