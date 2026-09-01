export type { IExecChildProcess, IExecResult, TExecPromise } from './exec';
export { exec, execFile } from './exec';
export type { IProcessChildProcess, IProcessResult } from './spawn';
export { fork, spawn } from './spawn';
export type { ChildProcess, ExecFileOptions, ExecOptions, ForkOptions, SpawnOptions } from 'node:child_process';
