# app-invoice-scheduler-task

An invoice ledger: 5,000 rows, a customer filter, and a background prefetch of the detail panel
for rows near the viewport. Typing in the filter or changing the chunk-size control restarts the
render, and restarting it while a run is in flight is the whole point of the example.

Domain: a ledger table too big to paint in one frame, with a detail lookup that is worth starting
early but not worth finishing if the row scrolls back out of view before anyone reads it.

## Why a scheduler, not a worker

The work here is DOM-bound: it builds and appends `<tr>` elements, and a row a user is not looking
at yet still has to land on the same thread the click handler and the layout pass run on. Moving it
to a worker does not remove that constraint, it just adds a serialization step in front of it. What
actually helps is being able to say which of several pending DOM tasks matters most right now, and
to change that answer as the user scrolls, which is exactly what a prioritized task scheduler is
for.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root
npm run build
cd examples
npm install
```

## Run

```
npm run dev:vanilla --workspace=app-invoice-scheduler-task
npm run dev:canc --workspace=app-invoice-scheduler-task
npm run start:vanilla --workspace=app-invoice-scheduler-task # production build + preview
npm run start:canc --workspace=app-invoice-scheduler-task
npm run test --workspace=app-invoice-scheduler-task
```

Open the printed preview URL, type in the filter, then type again before the table has finished
painting. Try both entries in the chunk-size control: at 1000 rows per chunk the page keeps
painting well past the point where you changed the filter; at 100 it stops almost at once. The
longest-freeze number in the responsiveness panel moves with it.

## The four lanes

Everything on screen maps to one band on the scheduler, or to the timers pair that stands in for
it where no scheduler exists:

- **First screenful.** The first 25 rows are posted at `user-blocking`, ahead of everything else,
 so the table shows real rows instead of a blank area while the rest of the ledger is still being
 built.
- **Rest of the table.** Remaining rows are appended in chunks, handing the thread back between
 them at the default band, so a background prefetch or a retry backoff cannot resume ahead of the
 paint the user is watching.
- **Background prefetch.** Each row within reach of the viewport starts a detail prefetch at the
 lowest band. Most of them are never promoted, because the row scrolls past before anyone stops on
 it.
- **Promoted prefetch and the filter debounce.** A row that actually becomes visible moves its
 prefetch to `user-blocking`; the filter's debounce timer resumes at the same band, because typing
 is the most immediate thing happening on the page.

## What cancel actually stops

Canceling a render or a prefetch lands in one of three places, and the difference between them is
the actual lesson:

1. **Queued.** A task still sitting in the scheduler's queue is dequeued and its callback never
 runs. This is the case a filter change usually hits: most of the table's remaining chunks and most
 pending prefetches are still queued when the next keystroke supersedes them.
2. **Running a synchronous chunk.** Nothing interrupts it. JavaScript runs a task to completion, so
 the handler that would call `cancel()` cannot run until the chunk returns, which makes the chunk
 size the cancel latency you chose. A flag check placed inside that loop is dead code for the same
 reason: nothing can flip the flag while the loop holds the thread. The chunk-size control makes
 this literal, not just stated, by changing how long that latency is.
3. **Suspended at a yield or an await.** Cancel lands right there, and any cancelable work the body
 was awaiting is aborted rather than abandoned. The detail prefetch is the case that shows this:
 canceling a render run aborts the request its prefetch was waiting on, and the mock API's call log
 records it as aborted rather than as a completed response nobody read.

## Why the toolbox helpers are driven by scheduler-derived timers

`retry` (in the detail prefetch) and `debounce` (on the filter) both wait before doing something,
and both waits here are handed a timers pair backed by the scheduler instead of the ambient one.
The reasons are the same as for any scheduler-backed wait:

- the resume happens at the priority you chose, instead of joining one undifferentiated timer queue
 where a background retry competes with work the user is looking at;
- a wait that has not fired yet can still be re-prioritized, which a queued `setTimeout` callback
 cannot;
- the delay is not capped at 2^31-1 ms, so a long wait needs no chunking;
- canceling dequeues the pending resume with the real cancel reason instead of an opaque
 `clearTimeout`;
- deeply nested `setTimeout` calls get clamped to a few milliseconds by browsers, which a retry
 backoff or a poll loop hits; a scheduled task does not accumulate that penalty.

Honest limits apply just the same: a hidden tab throttles a scheduled task the same way it throttles
a timer, and where no scheduler exists at all (Safari today, node) the pair this library hands back
is just the platform timers again, and priority means nothing.

Two live cases carry this: the retry backoff in `prefetch-details-canc.ts` runs its wait as a
`background` task, so a failed detail lookup never resumes ahead of the row the user is looking at;
the filter's debounce in `main-canc.ts` runs at `user-blocking`, so the search itself starts at the
priority the interaction deserves.

Priorities never reorder `.then` continuations, only the scheduled task or timer a wait suspends on.

## Files to diff

- `src/render-table-vanilla.ts` vs `src/render-table-canc.ts`: the chunked paint. Vanilla carries
 both the naive loop that owns the thread until the last row and the scheduled loop that is the fair
 comparison; canc is one coroutine.
- `src/prefetch-details-vanilla.ts` vs `src/prefetch-details-canc.ts`: the background lookup,
 promotion, and retry. The vanilla twin writes out the controller registry, the forwarding listener
 and the backoff loop that the canc twin gets from `postSchedulerTask` and `retry`.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: entry points, wiring the shell to search, render and
 prefetch.
- `src/platform-scheduler.ts`: five lines reading `scheduler` and `TaskController` off `globalThis`
 together, shared by both entries. It carries no cancellation concept of its own.
- `src/table-shared.ts`, `src/util/report.ts`, `src/util/responsiveness.ts`: shared shell, not part
 of the diff.

## Support

Chrome has shipped a prioritized task scheduler since version 94; Firefox since 142, with `yield`
landing separately at 129 for Chrome and 142 for Firefox. Safari ships neither as of this writing.
The `scheduler-polyfill` package exists for the gap. It is not a dependency of this example, and it
is worth knowing what it does not give back: it degrades `user-blocking` to `user-visible`, and it
does not inherit priority into a `yield`ed continuation the way the native implementation does.

## `src/lib/web-scheduler`

The helper library this example runs on lives at `src/lib/web-scheduler/` and is written to be
copied, not just read: every export carries its own documentation, nothing in it reaches outside
its own directory, and it declares no global types. Installing `@types/wicg-task-scheduling`
alongside it conflicts with nothing, because every type here is module scoped and repo prefixed
rather than a redeclaration of the platform's own names, so it keeps compiling unchanged on the day
those names land in the DOM library for real.

## Copying

`postSchedulerTask`, `yieldSchedulerTask` and `createSchedulerTimers` in `src/lib/web-scheduler/`
are the reusable piece: a cancelable wrapper around the platform scheduler that degrades to plain
timers where no scheduler exists, and a timers pair that lets any toolbox helper resume at a chosen
priority without knowing what a scheduler is. `src/table-shared.ts` and the mock invoice domain are
scaffolding for this demo, not something to copy.
