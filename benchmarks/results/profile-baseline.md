# CPU profile baseline

Captured with `node --cpu-prof` against the built core bundle
(`packages/canc-promise/dist/index.cjs`) on Node v24, i7-12700KF. Each case runs a
warmup then a fixed iteration count under the sampling profiler; self-time is
aggregated per function from the `.cpuprofile` samples. Numbers are relative signal
(sampling profiler, ~sub-ms resolution), not exact per-call costs. Line numbers are
into the transpiled `dist/index.cjs`; the source function names are stable.

Three cases: `chain-10` (build+settle a depth-10 then chain), `all-1000` (all() over
1000 resolved promises), `storm` (build a pending depth-50 chain, cancel the root,
swallow the CancelError). Drivers and the aggregation script are throwaway (not
committed); reproduce with `node --cpu-prof --cpu-prof-dir=<dir> drive.js <case> <iters>`.

## Top self-time functions

### chain-10 (414ms, 238 samples)

| self % | function | dist loc |
|-------:|----------|----------|
| 28.6 | CancelablePromise (constructor) | index.cjs:259 |
| 11.3 | _getOptions | index.cjs:701 |
| 9.7 | _checkOptionsChanged | index.cjs:728 |
| 9.2 | resolve (static) | index.cjs:654 |
| 8.4 | _then | index.cjs:1036 |
| 7.1 | (gc) | native |
| 6.3 | chain10 (driver) | drive.js |
| 5.9 | _runSettlementEffects | index.cjs:1013 |
| 4.2 | (program) | native |
| 3.4 | resolve (executor closure) | index.cjs:324 |

### all-1000 (3342ms, 1896 samples)

| self % | function | dist loc |
|-------:|----------|----------|
| 31.9 | CancelablePromise (constructor) | index.cjs:259 |
| 14.3 | _getOptions | index.cjs:701 |
| 12.8 | _checkOptionsChanged | index.cjs:728 |
| 7.6 | _loop_2 (combinator per-item loop) | index.cjs:504 |
| 5.1 | _runSettlementEffects | index.cjs:1013 |
| 4.9 | _then | index.cjs:1036 |
| 4.5 | (gc) | native |
| 4.0 | (program) | native |
| 3.1 | resolve (static) | index.cjs:654 |
| 2.4 | then | index.cjs:833 |

### storm (5921ms, 3349 samples)

| self % | function | dist loc |
|-------:|----------|----------|
| 28.1 | CancelablePromise (constructor) | index.cjs:259 |
| 13.1 | _getOptions | index.cjs:701 |
| 8.5 | _checkOptionsChanged | index.cjs:728 |
| 6.8 | _then | index.cjs:1036 |
| 6.4 | then | index.cjs:833 |
| 5.0 | _runSettlementEffects | index.cjs:1013 |
| 3.6 | CancelError (constructor) | index.cjs:112 |
| 3.2 | (program) | native |
| 2.9 | (gc) | native |
| 2.7 | resolve (static) | index.cjs:654 |

## Findings

The three hottest self-time functions are the same across all three cases and together
account for roughly half of on-CPU time:

- **Constructor (`index.cjs:259`, 28-32%)** is the single dominant cost. Every derived
 promise (each `then`, each combinator item, each cancel suppression via `catch(noop)`)
 runs the full species construction path: `Reflect.construct` + two closure functions +
 `Object.assign` + bound `cancel` + options normalization. This is the primary target
 for the memory diet and the derived-promise fast path.
- **`_getOptions` (11-14%)** rebuilds a normalized options object on every construction,
 including in per-item combinator loops where the options are identical for every item.
 Hoisting it out of the loops and skipping it entirely on internal/species construction
 removes most of this.
- **`_checkOptionsChanged` (8-13%)** runs on the `resolve()` wrap-check path (`then` calls
 `resolve`, which compares option keys). Removing the wrap-check from the hot `then` path
 eliminates it there.
- **`all-1000`** additionally spends 7.6% in the per-item combinator loop (`_loop_2`,
 `index.cjs:504`), which itself calls `_getOptions` per item.
- **`storm`** additionally spends 3.6% constructing `CancelError` and shows `then`
 self-time from the suppression `catch(noop)` (another full species construction). A
 cheaper suppression that still marks the rejection handled without constructing a
 species instance is the storm-path target.

Optimization tasks in this phase cite these numbers. Re-run after the pass to confirm the
constructor / `_getOptions` / `_checkOptionsChanged` share drops.
