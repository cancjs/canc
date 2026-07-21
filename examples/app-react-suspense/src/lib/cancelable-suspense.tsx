import {
 type DependencyList,
 type ReactNode,
 Suspense,
 use,
 useEffect,
 useMemo,
} from 'react';
import { type CancelablePromise, suppressCancel } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

/**
 * Factory for a suspending resource. It receives `getSignal`, the accessor `cancelify` hands out:
 * call it to get an `AbortSignal` that aborts when the resource is canceled, and thread it into
 * whatever request the resource makes.
 */
export type ResourceFactory<T> = (getSignal: () => AbortSignal) => Promise<T>;

/**
 * Render-as-you-fetch: start the request during render and get back a stable `CancelablePromise`
 * to hand to a Suspense boundary. The promise identity is memoized per `deps`, which `React.use`
 * requires (a fresh promise every render would suspend forever). Changing `deps` starts a new
 * resource; the previous one is left for the boundary to cancel.
 *
 * This does not read the resource. Create it here, above the boundary, then pass it to
 * `CancelableSuspense` so the boundary owns its lifetime.
 */
export function useCancelableResource<T>(
 factory: ResourceFactory<T>,
 deps: DependencyList
): CancelablePromise<T> {
 return useMemo(() => cancelify(({ getSignal }) => factory(getSignal))(), deps);
}

function ResourceReader<T>({
 resource,
 children,
}: {
 resource: CancelablePromise<T>;
 children: (value: T) => ReactNode;
}): ReactNode {
 // Suspends until the resource settles. While suspended this component never commits, so its own
 // effects never run. Cancellation cannot live here.
 return children(use(resource));
}

/**
 * A Suspense boundary that cancels its resource when the resource is abandoned. The boundary
 * commits and stays mounted while its child suspends, so its cleanup effect is the one place that
 * reliably runs when the resource is superseded or the boundary unmounts. A plain `<Suspense>`
 * gives you the fallback but no abandon hook, so a canceled route would leave the request running.
 *
 * Pass a resource from `useCancelableResource`. The render prop receives the resolved value.
 */
export function CancelableSuspense<T>({
 resource,
 fallback,
 children,
}: {
 resource: CancelablePromise<T>;
 fallback: ReactNode;
 children: (value: T) => ReactNode;
}): ReactNode {
 // The boundary commits even while its child suspends, so this cleanup fires on unmount or when a
 // new resource supersedes the old one. Canceling here aborts the in-flight request.
 useEffect(() => {
 suppressCancel(resource);
 return () => {
 resource.cancel();
 };
 }, [resource]);

 return (
 <Suspense fallback={fallback}>
 <ResourceReader resource={resource}>{children}</ResourceReader>
 </Suspense>
 );
}
