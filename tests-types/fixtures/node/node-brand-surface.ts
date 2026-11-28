import {
  JsonParseError,
  NotImplementedError,
  ProcessExitError,
  ProcessSpawnError,
  isJsonParseError,
  isNotImplementedError,
  isProcessExitError,
  isProcessSpawnError,
} from '@cancjs/node';
// @ts-expect-error internal constant
import { JSON_PARSE_ERROR_BRAND } from '@cancjs/node';
// @ts-expect-error internal constant
import { NOT_IMPLEMENTED_ERROR_BRAND } from '@cancjs/node';
// @ts-expect-error internal constant
import { PROCESS_EXIT_ERROR_BRAND } from '@cancjs/node';
// @ts-expect-error internal constant
import { PROCESS_SPAWN_ERROR_BRAND } from '@cancjs/node';

void [
  JsonParseError,
  NotImplementedError,
  ProcessExitError,
  ProcessSpawnError,
  isJsonParseError,
  isNotImplementedError,
  isProcessExitError,
  isProcessSpawnError,
];
