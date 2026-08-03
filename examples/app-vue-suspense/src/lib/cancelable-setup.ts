import * as canc from '@cancjs/coroutine';
import { isCancPromise, suppressCancel } from '@cancjs/promise';
import { onScopeDispose, type SetupContext } from 'vue';

/**
 * What a setup function may return: a plain value (a sync setup), a generator (the short form,
 * wrapped into a coroutine here), or a promise (a setup already wrapped with `canc.async`).
 */
export type SetupResult<Result> = Result | Promise<Result> | Generator<unknown, Result, any>;

/** A setup function in any of the three supported shapes. */
export type CancelableSetup<Props, Result> = (props: Props, ctx: SetupContext) => SetupResult<Result>;

function isGenerator(value: unknown): value is Generator<unknown, unknown, any> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Generator<unknown, unknown, any>;
  return (
    typeof candidate.next === 'function' &&
    typeof candidate.throw === 'function' &&
    typeof candidate.return === 'function'
  );
}

/**
 * Wraps a setup function so its awaited work runs as one cancelable coroutine tied to the
 * component's effect scope. Use it as the `setup` option, writing the body as a generator with
 * `yield* canc.await(...)` where an async setup would `await`:
 *
 * ```ts
 * export default defineComponent({
 *  props: { id: { type: String, required: true } },
 *  setup: cancelableSetup(function* setup(props: { id: string }) {
 *   const data = yield* canc.await(loadData(props.id));
 *   return { data };
 *  }),
 * });
 * ```
 *
 * A setup already wrapped with `canc.async` works too, for a coroutine defined elsewhere and
 * reused: `cancelableSetup(canc.async(function* setup(props) { ... }))`. The generator form above
 * is shorter, so prefer it when the body is written inline. A sync setup (one returning bindings
 * directly) passes straight through, with no scope hook registered.
 *
 * The async setup drives `<Suspense>`: the fallback shows until the coroutine settles. When the
 * component's scope tears down before then (a route change under the boundary, or the boundary
 * dropping the pending component), `onScopeDispose` cancels the in-flight coroutine, aborting any
 * request it wired through `canc.await`. Vue's `<script setup>` cannot host this, its top-level
 * `await` has no scope hook to cancel, so this setup-option wrapper is the opt-in.
 */
export function cancelableSetup<Props, Result>(
  setup: CancelableSetup<Props, Result>,
): (props: Props, ctx: SetupContext) => Result | Promise<Result> {
  return (props: Props, ctx: SetupContext) => {
    const started = setup(props, ctx);

    // A generator setup becomes one coroutine here. yield* delegation passes a cancel straight
    // into it, so its own finally blocks still run.
    const task =
      isGenerator(started) ?
        canc.async(function* () {
          return yield* started;
        })()
      : started;

    // Nothing to cancel: a sync setup, or a promise from somewhere other than canc.
    if (!isCancPromise(task)) return task;

    // Registered synchronously in the setup scope, before the first await suspends.
    onScopeDispose(() => {
      task.cancel('setup scope disposed');
    });

    // A superseded setup rejects with CancelError; that is expected, not an error to surface.
    suppressCancel(task);

    return task;
  };
}
