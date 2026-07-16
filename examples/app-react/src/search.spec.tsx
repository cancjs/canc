import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SearchPage as CancSearchPage } from './SearchPage-canc';
import { FlightRow as CancFlightRow } from './FlightRow-canc';
import { FlightRow as VanillaFlightRow } from './FlightRow-vanilla';
import { createFlightApi } from './mock/api';

const LATENCY = 50;

function countByStatus(calls: { endpoint: string; status: string }[], endpoint: string, status: string): number {
 return calls.filter((c) => c.endpoint === endpoint && c.status === status).length;
}

// Types three characters faster than one search can complete, so all three searches overlap.
async function typeThreeChars(): Promise<void> {
 const input = screen.getByLabelText('destination');
 for (const value of ['l', 'lo', 'lon']) {
 fireEvent.change(input, { target: { value } });
 // Flush the effect that starts (and, for canc, cancels the previous) search — but do NOT let a
 // search's latency elapse: the next keystroke lands first.
 await act(async () => {
 await Promise.resolve();
 });
 }
}

describe('canc SearchPage', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => jest.useRealTimers());

 it('cancels every superseded search — one completes, the earlier two abort', async () => {
 const api = createFlightApi({ latency: LATENCY });
 render(<CancSearchPage api={api} />);

 await typeThreeChars();

 // Let the surviving search finish.
 await act(async () => {
 jest.advanceTimersByTime(LATENCY);
 await Promise.resolve();
 });

 expect(countByStatus(api.calls, 'flights.searchDestinations', 'completed')).toBe(1);
 expect(countByStatus(api.calls, 'flights.searchDestinations', 'aborted')).toBe(2);
 });

 it('cancels the pending search on unmount (no post-unmount state update)', async () => {
 const api = createFlightApi({ latency: LATENCY });
 const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
 const { unmount } = render(<CancSearchPage api={api} />);

 fireEvent.change(screen.getByLabelText('destination'), { target: { value: 'lon' } });
 await act(async () => {
 await Promise.resolve();
 });

 unmount();
 await act(async () => {
 jest.advanceTimersByTime(LATENCY);
 await Promise.resolve();
 });

 expect(countByStatus(api.calls, 'flights.searchDestinations', 'aborted')).toBe(1);
 expect(countByStatus(api.calls, 'flights.searchDestinations', 'completed')).toBe(0);
 // React warns "state update on an unmounted component" via console.error — none should fire.
 expect(errorSpy).not.toHaveBeenCalled();
 errorSpy.mockRestore();
 });
});

describe('canc FlightRow', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => jest.useRealTimers());

 it('cancels the hover prefetch when the pointer leaves', async () => {
 const api = createFlightApi({ latency: LATENCY });
 render(<CancFlightRow api={api} destination={{ id: 'lhr', city: 'London', code: 'LHR' }} />);

 const row = screen.getByTestId('row-lhr');
 fireEvent.mouseEnter(row);
 await act(async () => {
 await Promise.resolve();
 });
 fireEvent.mouseLeave(row);
 await act(async () => {
 jest.advanceTimersByTime(LATENCY);
 await Promise.resolve();
 });

 expect(countByStatus(api.calls, 'flights.details', 'aborted')).toBe(1);
 expect(countByStatus(api.calls, 'flights.details', 'completed')).toBe(0);
 });

 it('fires the effect-only warm-cache prefetch on hover and cancels it on unhover', async () => {
 const api = createFlightApi({ latency: LATENCY });
 render(<CancFlightRow api={api} destination={{ id: 'lhr', city: 'London', code: 'LHR' }} />);

 const row = screen.getByTestId('row-lhr');
 fireEvent.mouseEnter(row);
 await act(async () => {
 await Promise.resolve();
 });
 fireEvent.mouseLeave(row);
 await act(async () => {
 jest.advanceTimersByTime(LATENCY);
 await Promise.resolve();
 });

 // The warm prefetch is a useCancelableEffect side effect: it starts on hover and its cancel
 // aborts on unhover, with no render state involved.
 expect(countByStatus(api.calls, 'flights.warm', 'aborted')).toBe(1);
 expect(countByStatus(api.calls, 'flights.warm', 'completed')).toBe(0);
 });
});

describe('vanilla FlightRow', () => {
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => jest.useRealTimers());

 it('renders prefetched details on hover', async () => {
 const api = createFlightApi({ latency: LATENCY });
 render(<VanillaFlightRow api={api} destination={{ id: 'lhr', city: 'London', code: 'LHR' }} />);

 fireEvent.mouseEnter(screen.getByTestId('row-lhr'));
 await act(async () => {
 jest.advanceTimersByTime(LATENCY);
 await Promise.resolve();
 });

 await waitFor(() => expect(screen.getByTestId('details-lhr')).toBeInTheDocument());
 });

 it('keeps the prefetch running after the pointer leaves — the leak we teach', async () => {
 const api = createFlightApi({ latency: LATENCY });
 render(<VanillaFlightRow api={api} destination={{ id: 'lhr', city: 'London', code: 'LHR' }} />);

 const row = screen.getByTestId('row-lhr');
 fireEvent.mouseEnter(row);
 await act(async () => {
 await Promise.resolve();
 });
 fireEvent.mouseLeave(row);
 await act(async () => {
 jest.advanceTimersByTime(LATENCY);
 await Promise.resolve();
 });

 // Inverted assertion: the plain vanilla row cannot cancel, so the abandoned hover completes.
 expect(countByStatus(api.calls, 'flights.details', 'completed')).toBe(1);
 expect(countByStatus(api.calls, 'flights.details', 'aborted')).toBe(0);
 });
});
