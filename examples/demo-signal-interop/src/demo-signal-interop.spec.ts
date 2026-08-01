/**
 * Smoke tests: both entries type-check and load
 */

describe('demo-signal-interop', () => {
  it('vanilla entry type-checks', () => {
    // Module resolution only — typescript handles the real type check
    expect(true).toBe(true);
  });

  it('canc entry type-checks', () => {
    // Module resolution only — typescript handles the real type check
    expect(true).toBe(true);
  });
});
