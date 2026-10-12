import type { Socket } from 'node:dgram';
import type { Readable } from 'node:stream';

import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';
import { CancelablePromise, FailureOf, Unlisted } from '@cancjs/promise';

import { Eq, IsAny } from '../../../tests-types/fixtures/common/assert-type';
import * as childProcess from './child-process';
import * as crypto from './crypto';
import * as dgram from './dgram';
import * as dns from './dns';
import * as events from './events';
import * as fs from './fs';
import * as fsExtra from './fs-extra';
import * as readline from './readline';
import * as stream from './stream';
import * as timers from './timers';
import * as workerThreads from './worker-threads';
import * as zlib from './zlib';

class FooError extends Error {
  readonly foo = 1 as const;
}

declare const path: string;
declare const socket: Socket;
declare const readable: Readable;
declare const cpFoo: CancelablePromise<string, FooError>;

// Identity assertions on the failure set alone, so a resolved value type change cannot hide here.
// Nothing in this function runs; the checks are the compilation itself.
function _failureSets(): void {
  const _readFileIsOpen: Eq<FailureOf<ReturnType<typeof fs.readFile>>, Unlisted> = true;
  const readFileCall = fs.readFile(path, 'utf8');
  const _readFileCallIsOpen: Eq<FailureOf<typeof readFileCall>, Unlisted> = true;
  const _lookupIsOpen: Eq<FailureOf<ReturnType<typeof dns.lookup>>, Unlisted> = true;
  const _resolverIsOpen: Eq<FailureOf<ReturnType<dns.Resolver['resolve4']>>, Unlisted> = true;
  const keyPair = crypto.generateKeyPair('ed25519');
  const _keyPairIsOpen: Eq<FailureOf<typeof keyPair>, Unlisted> = true;
  const _pbkdf2IsOpen: Eq<FailureOf<ReturnType<typeof crypto.pbkdf2>>, Unlisted> = true;
  const _gzipIsOpen: Eq<FailureOf<ReturnType<typeof zlib.gzip>>, Unlisted> = true;
  const _execIsOpen: Eq<FailureOf<childProcess.IExecChildProcess['promise']>, Unlisted> = true;
  const _execPromiseIsOpen: Eq<FailureOf<childProcess.TExecPromise>, Unlisted> = true;
  const _spawnIsOpen: Eq<FailureOf<childProcess.IProcessChildProcess['promise']>, Unlisted> = true;
  const sent = dgram.send(socket, 'x', 41234);
  const _dgramSendIsOpen: Eq<FailureOf<typeof sent>, Unlisted> = true;
  const _onceIsOpen: Eq<FailureOf<ReturnType<typeof events.once>>, Unlisted> = true;
  const _questionIsOpen: Eq<FailureOf<ReturnType<readline.Interface['question']>>, Unlisted> = true;
  const _textIsOpen: Eq<FailureOf<ReturnType<typeof stream.text>>, Unlisted> = true;
  const _toArrayIsOpen: Eq<FailureOf<ReturnType<typeof stream.toArray>>, Unlisted> = true;
  const finished = stream.finished(readable);
  const _finishedIsOpen: Eq<FailureOf<typeof finished>, Unlisted> = true;

  // a declared member keeps its place next to a platform call, and the reason reads as any
  const raced = CancelablePromise.race([cpFoo, fs.readFile(path)]);
  const _raceKeepsDeclared: Eq<FailureOf<typeof raced>, FooError | Unlisted> = true;
  const code = raced.catch((e) => {
    const _reasonIsAny: Eq<IsAny<typeof e>, true> = true;
    void _reasonIsAny;
    return e.code as string;
  });

  // cancel-only and never-rejecting calls stay closed and empty
  const _setTimeoutIsEmpty: Eq<FailureOf<ReturnType<typeof timers.setTimeout>>, never> = true;
  const _setImmediateIsEmpty: Eq<FailureOf<ReturnType<typeof timers.setImmediate>>, never> = true;
  const _existsIsEmpty: Eq<FailureOf<ReturnType<typeof fs.exists>>, never> = true;
  const _pathExistsIsEmpty: Eq<FailureOf<ReturnType<typeof fsExtra.pathExists>>, never> = true;
  const _waitIsEmpty: Eq<FailureOf<ReturnType<typeof timers.scheduler.wait>>, never> = true;
  type TExecCancelResult = Exclude<ReturnType<childProcess.TExecPromise['cancel']>, void>;
  const _execCancelIsEmpty: Eq<FailureOf<TExecCancelResult>, never> = true;

  // the caller's own callback or worker body decides what these reject with
  const _everyIsUndeclared: Eq<FailureOf<ReturnType<typeof stream.every>>, unknown> = true;
  const _someIsUndeclared: Eq<FailureOf<ReturnType<typeof stream.some>>, unknown> = true;
  const _findIsUndeclared: Eq<FailureOf<ReturnType<typeof stream.find>>, unknown> = true;
  const _forEachIsUndeclared: Eq<FailureOf<ReturnType<typeof stream.forEach>>, unknown> = true;
  const _reduceIsUndeclared: Eq<FailureOf<ReturnType<typeof stream.reduce>>, unknown> = true;
  const _cpIsUndeclared: Eq<FailureOf<ReturnType<typeof fs.cp>>, unknown> = true;
  const _copyIsUndeclared: Eq<FailureOf<ReturnType<typeof fsExtra.copy>>, unknown> = true;
  const _writeJsonIsUndeclared: Eq<FailureOf<ReturnType<typeof fsExtra.writeJson>>, unknown> = true;
  const piped = stream.pipeline(readable, async function* (source: AsyncIterable<unknown>) {
    yield* source;
  });
  const _pipelineIsUndeclared: Eq<FailureOf<typeof piped>, unknown> = true;
  const _runTaskIsUndeclared: Eq<FailureOf<ReturnType<typeof workerThreads.runTask>>, unknown> = true;
  const _lockIsUndeclared: Eq<FailureOf<ReturnType<typeof workerThreads.requestLock>>, unknown> = true;
  const _workerIsUndeclared: Eq<FailureOf<workerThreads.IWorkerWithPromise['promise']>, unknown> = true;

  // a coroutine lists declared failures only, so the open marker of a platform call drops out
  const read = cancAsync(function* () {
    const text = yield* cancAwait(fs.readFile(path));
    return text;
  });
  const _coroutineStripsMarker: Eq<FailureOf<ReturnType<typeof read>>, never> = true;

  void [
    readFileCall,
    keyPair,
    sent,
    finished,
    piped,
    read,
    _readFileIsOpen,
    _readFileCallIsOpen,
    _lookupIsOpen,
    _resolverIsOpen,
    _keyPairIsOpen,
    _pbkdf2IsOpen,
    _gzipIsOpen,
    _execIsOpen,
    _execPromiseIsOpen,
    _spawnIsOpen,
    _dgramSendIsOpen,
    _onceIsOpen,
    _questionIsOpen,
    _textIsOpen,
    _toArrayIsOpen,
    _finishedIsOpen,
    _raceKeepsDeclared,
    code,
    _setTimeoutIsEmpty,
    _setImmediateIsEmpty,
    _existsIsEmpty,
    _pathExistsIsEmpty,
    _waitIsEmpty,
    _execCancelIsEmpty,
    _everyIsUndeclared,
    _someIsUndeclared,
    _findIsUndeclared,
    _forEachIsUndeclared,
    _reduceIsUndeclared,
    _cpIsUndeclared,
    _copyIsUndeclared,
    _writeJsonIsUndeclared,
    _pipelineIsUndeclared,
    _runTaskIsUndeclared,
    _lockIsUndeclared,
    _workerIsUndeclared,
    _coroutineStripsMarker,
  ];
}

describe('failure sets of node wrappers', () => {
  it('rejects with the platform error the open set leaves room for', async () => {
    const missing = fs.readFile(`${__dirname}/does-not-exist.txt`);

    const code = await missing.catch((e) => e.code as string);

    expect(code).toBe('ENOENT');
    expect(typeof _failureSets).toBe('function');
  });
});
