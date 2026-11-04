import type { IAbortSignal, IExecutorContext, TAbortSignal } from '@cancjs/promise';
import type { ICancelifyContext } from '@cancjs/toolbox';

import type { Equal, Expect } from '../common/assert-type';

type _executorSignal = Expect<Equal<IExecutorContext['signal'], IAbortSignal>>;
type _executorGetSignal = Expect<Equal<ReturnType<IExecutorContext['getSignal']>, IAbortSignal>>;
type _alias = Expect<Equal<TAbortSignal, IAbortSignal>>;
type _cancelifySignal = Expect<Equal<ICancelifyContext['signal'], IAbortSignal>>;
