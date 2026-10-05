import interfaceConstructorManifest from '../../surface/readline.InterfaceConstructor.json';
import { acceptsSignal, IManifestEntry } from '../fs/wrap';

// Symbol.dispose landed on the shared Interface base at v23.10.0, then backported to the 22 LTS
// line at v22.15.0. A major-only gate reads 22.0 through 22.14 as supported; asserting against the
// committed manifest rather than a hand-copied literal is what keeps this test honest if the fact
// ever changes.
describe('readline surface manifest', () => {
  const disposeEntry = interfaceConstructorManifest.exports.find((exp) => exp.name === '[Symbol.dispose]') as
    IManifestEntry | undefined;

  it('has a manifest entry for Symbol.dispose', () => {
    expect(disposeEntry).toBeDefined();
  });

  it('reads the 22 LTS backport off sinceByMajor rather than the top-level since string', () => {
    expect(acceptsSignal(disposeEntry, '22.14.0')).toBe(false);
    expect(acceptsSignal(disposeEntry, '22.15.0')).toBe(true);
  });
});
