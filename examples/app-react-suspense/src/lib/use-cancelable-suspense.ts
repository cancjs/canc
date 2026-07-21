import { type DependencyList, use, useEffect, useMemo } from 'react';
import { type CancelablePromise, suppressCancel } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

import type { ResourceFactory } from './cancelable-suspense';

/**
 * The tempting-but-broken hook: create the resource, read it with `use` (which suspends), and try
 * to cancel it in this same component's cleanup effect.
 *
 * It leaks. A component that suspends on first render never commits, so its effects never run.
 * When the resource is abandoned during the fallback (a route change while loading), the cleanup
 * that would cancel it is never scheduled, and the request runs to completion in the background.
 *
 * Cancellation has to live in a component that commits. `CancelableSuspense` is that component;
 * this hook is here only to show why the in-child approach does not work.
 */
export function useCancelableSuspense<T>(factory: ResourceFactory<T>, deps: DependencyList): T {
 const resource: CancelablePromise<T> = useMemo(
 () => cancelify(({ getSignal }) => factory(getSignal))(),
 deps
 );

 // Never runs while this component is suspended: the effect is only scheduled after a commit, and
 // a suspending component never commits. So the cancel below is dead code on the abandon path.
 useEffect(() => {
 suppressCancel(resource);
 return () => {
 resource.cancel();
 };
 }, [resource]);

 return use(resource);
}
