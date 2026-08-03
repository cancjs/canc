import { AvailabilityResult } from './availability';
import { findRooms, loadRates, scanBookings } from './mock/db';

// (no cancelable repository boundary - see -canc) The repository fns are used exactly as mock/db.ts
// exports them: plain promises, called directly by the search below.
// (no cancellation counterpart - see -canc) There is nothing to skip a query that has not started.
// (no cancellation counterpart - see -canc) The scan gets no signal here either, so the query-level
// abort flag in mock/db.ts has nothing to switch on and every booking is walked.

// Plain uncancelable availability search: find rooms, load their rates, scan bookings for occupancy.
// A dropped connection cannot stop this. Once the first query starts, every step below runs to
// completion and the result is thrown away. The workaround flavor (AbortController threading,
// staleness flags) lives in the express-kysely example; here vanilla stays plain so the canc twin's
// ambient cancellation stands out on its own.
export async function searchAvailability(hotelId: string, date: string): Promise<AvailabilityResult> {
  const rooms = await findRooms(hotelId);
  const roomIds = rooms.map((room) => room._id);

  // no cancellation counterpart, this always runs even if the client already left
  const rates = await loadRates(roomIds, date);
  const rateAmounts = rates.map((rate) => rate.amount);
  const averageRate =
    rateAmounts.length ? rateAmounts.reduce((sum, amount) => sum + amount, 0) / rateAmounts.length : 0;

  // no cancellation counterpart, the scan walks every booking for a dead socket
  const occupancy = await scanBookings(roomIds, date);

  // result is returned to nobody when the connection is already closed
  const result: AvailabilityResult = {
    hotelId,
    date,
    roomsFound: rooms.length,
    averageRate,
    occupancy,
  };
  return result;
}
