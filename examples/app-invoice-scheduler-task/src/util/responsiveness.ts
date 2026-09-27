/** Live handle for the responsiveness readout; call destroy when the demo tears down. */
export interface IResponsivenessReport {
  destroy(): void;
}

/**
 * Renders two numbers in plain words: how long a keystroke takes to reach the next frame, and
 * the longest main-thread freeze observed so far. A number that cannot be measured on this
 * browser hides itself instead of reporting a false zero.
 */
export function createResponsivenessReport(root: HTMLElement): IResponsivenessReport {
  const keystrokeLine = document.createElement('div');
  keystrokeLine.textContent = 'keystroke response: waiting';
  root.append(keystrokeLine);

  const onInput = () => {
    const inputTime = performance.now();
    requestAnimationFrame(() => {
      const latency = Math.round(performance.now() - inputTime);
      keystrokeLine.textContent = `keystroke response: ${latency} ms`;
    });
  };
  document.addEventListener('input', onInput);

  let observer: PerformanceObserver | undefined;
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const freezeLine = document.createElement('div');
      freezeLine.textContent = 'longest freeze: none yet';
      let longestFreeze = 0;
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longestFreeze = Math.max(longestFreeze, entry.duration);
        }
        freezeLine.textContent = `longest freeze: ${Math.round(longestFreeze)} ms`;
      });
      observer.observe({ entryTypes: ['longtask'] });
      root.append(freezeLine);
    } catch {
      // longtask entries unsupported here, leave the number hidden rather than lying with a zero
      observer = undefined;
    }
  }

  return {
    destroy() {
      document.removeEventListener('input', onInput);
      observer?.disconnect();
    },
  };
}
