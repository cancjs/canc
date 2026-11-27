import { CancelScope } from '@cancjs/axios';
import type { CancelError } from '@cancjs/promise';

declare const scope: CancelScope;
// @ts-expect-error internal response machinery
scope.holdStream({});
// @ts-expect-error internal rejection machinery
scope.rejectOnAbort((_error: CancelError) => {});
void scope.cancel;
void scope.link;
void scope.watch;
void scope.finalize;
void scope.abort;
void scope.toRejection;
void scope.isCanceled;
