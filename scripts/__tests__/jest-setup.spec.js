/* global describe, it, expect, beforeAll, afterAll, jest */

const { execSync } = require('child_process');

describe('jest.setup.js', () => {
  it('reports all leaked errors and attributes them', () => {
    try {
      execSync('npx jest --testMatch="**/leak.fixture.js"', { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      const out = err.stdout + '\n' + err.stderr;
      expect(out).toContain('leak 1');
      expect(out).toContain('leak 2');
      expect(out).toContain('[leaks › test B]');
      expect(out).toContain('leak from A');
    }
  });

  it('keeps fake timers in second test', () => {
    const out = execSync('npx jest --testMatch="**/fake-timer.fixture.js"', { encoding: 'utf8', stdio: 'pipe' });
    expect(out).toContain('PASS');
  });

  it('has 1 listener', () => {
    expect(process.listenerCount('unhandledRejection')).toBe(1);
  });
});
