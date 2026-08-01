import { cancAsync } from '@cancjs/coroutine';
import { type CancelablePromise, suppressCancel } from '@cancjs/promise';
import { onScopeDispose } from 'vue';

/**
 * A generator setup function. Write it exactly like an async `setup()`, but `yield* cancAwait(...)`
 * each awaited step instead of `await`. It returns whatever a normal setup returns (the render
 * context, or a render function).
 */
export type SetupGenerator<Props, Result> = (props: Props) => Generator<unknown, Result, unknown>;

/**
 * Wraps a generator setup function so its awaited work runs as one cancelable coroutine tied to the
 * component's effect scope. Use it as the `setup` option:
 *
 * ```ts
 * export default { setup: cancelableSetup(function* setup(props) {
 * const data = yield* cancAwait(loadData(props.id));
 * return { data };
 * }) };
 * ```
 *
 * The async setup drives `<Suspense>`: the fallback shows until the coroutine settles. When the
 * component's scope tears down before then (a route change under the boundary, or the boundary
 * dropping the pending component), `onScopeDispose` cancels the in-flight coroutine, aborting any
 * request it wired through `cancAwait`. Vue's `<script setup>` cannot host this, its top-level
 * `await` has no scope hook to cancel, so this setup-option wrapper is the opt-in.
 */
export function cancelableSetup<Props, Result>(
  setup: SetupGenerator<Props, Result>,
): (props: Props) => Promise<Result> {
  return (props: Props) => {
    const task: CancelablePromise<Result> = cancAsync(setup)(props);

    // Registered synchronously in the setup scope, before the first await suspends. Scope teardown
    // (route change, boundary drop) cancels the coroutine, so its in-flight request aborts too.
    onScopeDispose(() => {
      task.cancel('setup scope disposed');
    });

    // A superseded setup rejects with CancelError; that is expected, not an error to surface.
    suppressCancel(task);
    return task;
  };
}
