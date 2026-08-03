import * as canc from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';

import { AvailabilityResult } from './availability';
import { findRooms, loadRates, scanBookings } from './mock/db';

// Cancelable repository boundary. The repository fns are plain promises; cancelify makes them
// canc-native once, here, so the search below reads like plain async/await with no signal in it.
// These two carry no signal. A canceled chain skips a query that has not started yet, which is the
// whole win for a short lookup. A query-level signal is the connection-churn path, see the README.
const findHotelRooms = cancelify((_ctx, [hotelId]: [string]) => findRooms(hotelId));
const loadRoomRates = cancelify((_ctx, [roomIds, date]: [string[], string]) => loadRates(roomIds, date));
// The scan is the long step, so this one does take the signal. A cancel stops the document loop
// where it stands instead of walking the rest of the bookings.
const scanRoomBookings = cancelify(({ getSignal }, [roomIds, date]: [string[], string]) =>
  scanBookings(roomIds, date, { signal: getSignal() }),
);

// Cancelable availability search: find rooms, load their rates, scan bookings for occupancy.
// Cancellation is ambient. If the client disconnects while a query is in flight, the chain stops
// between steps and the remaining queries are never issued.
export const searchAvailability = canc.async(function* (hotelId: string, date: string) {
  const rooms = yield* canc.await(findHotelRooms(hotelId));
  const roomIds = rooms.map((room) => room._id);

  // canceled here, loadRates is never issued when the client already left
  const rates = yield* canc.await(loadRoomRates(roomIds, date));
  const rateAmounts = rates.map((rate) => rate.amount);
  const averageRate =
    rateAmounts.length ? rateAmounts.reduce((sum, amount) => sum + amount, 0) / rateAmounts.length : 0;

  // canceled here, and a cancel during the scan stops it at the booking it is on
  const occupancy = yield* canc.await(scanRoomBookings(roomIds, date));

  // nothing below runs once canceled, so the result is only built for a live connection
  const result: AvailabilityResult = {
    hotelId,
    date,
    roomsFound: rooms.length,
    averageRate,
    occupancy,
  };
  return result;
});
