import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';

import { DestinationPicker } from './app';
import { DetailPanel as CancDetailPanel } from './DetailPanel-canc';
import { DetailPanel as VanillaDetailPanel } from './DetailPanel-vanilla';
import { createTravelApi } from './mock/api';
import { NaiveDetailPanel } from './NaiveDetailPanel-canc';

const LATENCY = 50;

const DESTINATIONS = [
  { id: 'lhr', city: 'London', code: 'LHR' },
  { id: 'nrt', city: 'Tokyo', code: 'NRT' },
];

function countByStatus(calls: { endpoint: string; status: string }[], endpoint: string, status: string): number {
  return calls.filter((c) => c.endpoint === endpoint && c.status === status).length;
}

// A page whose selected destination drives the flavored detail panel. Shared across the three
// flavors so each spec only swaps the Panel component.
function makePage(Panel: (props: { api: ReturnType<typeof createTravelApi>; id: string }) => ReactNode) {
  return function Page({ api }: { api: ReturnType<typeof createTravelApi> }): ReactNode {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <>
        <DestinationPicker
          destinations={DESTINATIONS}
          selected={selected}
          onSelect={setSelected}
        />
        {selected && (
          <Panel
            api={api}
            id={selected}
          />
        )}
      </>
    );
  };
}

// Picks the first destination, then the second before the first load settles, so the first load is
// abandoned mid-flight.
async function pickThenSwitch(): Promise<void> {
  fireEvent.click(screen.getByTestId('pick-lhr'));
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByTestId('pick-nrt'));
  await act(async () => {
    await Promise.resolve();
  });
}

describe('canc CancelableSuspense', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cancels the abandoned details load when another destination is picked mid-load', async () => {
    const api = createTravelApi({ latency: LATENCY });
    const Page = makePage(CancDetailPanel);
    render(<Page api={api} />);

    await pickThenSwitch();
    await act(async () => {
      jest.advanceTimersByTime(LATENCY);
      await Promise.resolve();
    });

    // The boundary that owns the first resource committed while its child suspended, so its cleanup
    // ran on switch and aborted the load. Only the surviving pick completes.
    expect(countByStatus(api.calls, 'travel.destinationDetails', 'aborted')).toBe(1);
    expect(countByStatus(api.calls, 'travel.destinationDetails', 'completed')).toBe(1);
  });
});

describe('naive in-child cancel (the leak we teach)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does NOT cancel the abandoned load — the suspending child never commits, so its effect never runs', async () => {
    const api = createTravelApi({ latency: LATENCY });
    const Page = makePage(NaiveDetailPanel);
    render(<Page api={api} />);

    await pickThenSwitch();
    await act(async () => {
      jest.advanceTimersByTime(LATENCY);
      await Promise.resolve();
    });

    // Inverted assertion: the in-child cancel effect never fires while suspended, so nothing is
    // aborted and the abandoned request completes anyway.
    expect(countByStatus(api.calls, 'travel.destinationDetails', 'aborted')).toBe(0);
    expect(countByStatus(api.calls, 'travel.destinationDetails', 'completed')).toBeGreaterThanOrEqual(1);
  });
});

describe('vanilla plain use', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps the abandoned load running after switching — the leak we teach', async () => {
    const api = createTravelApi({ latency: LATENCY });
    const Page = makePage(VanillaDetailPanel);
    render(<Page api={api} />);

    await pickThenSwitch();
    await act(async () => {
      jest.advanceTimersByTime(LATENCY);
      await Promise.resolve();
    });

    // Inverted assertion: a plain Promise has no cancel, so nothing aborts and the abandoned load
    // completes anyway.
    expect(countByStatus(api.calls, 'travel.destinationDetails', 'aborted')).toBe(0);
    expect(countByStatus(api.calls, 'travel.destinationDetails', 'completed')).toBeGreaterThanOrEqual(1);
  });
});
