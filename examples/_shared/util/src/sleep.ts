/**
 * Non-cancelable sleep utility for use in test/mock/scenario glue.
 * For cancelable delays in canc code, use toolbox `delay` instead.
 */
export const sleep = (ms: number): Promise<void> =>
 new Promise<void>((r) => setTimeout(r, ms));
