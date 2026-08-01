import { cancAsync, cancAwait } from '@cancjs/coroutine';

import { AvailabilityResult } from './availability';
import { aggregateOccupancy, findRooms, loadRates } from './mock/db';

// Cancelable availability search: find rooms, load their rates, aggregate occupancy.
// The repository fns are canc-native (see mock/db.ts), so this reads like plain async/await with
// no signal threading. Cancellation is ambient: if the client disconnects while a query is in
// flight, the chain stops between steps and the remaining queries are never issued.
// Mongoose cannot abort a statement already sent to the server (honesty note in the README), so
// this cancels at the chain level, skipping the queries that have not started yet.
export const searchAvailability = cancAsync(function* (hotelId: string, date: string) {
  const rooms = yield* cancAwait(findRooms(hotelId, date));
  const roomIds = rooms.map((room) => room._id);

  // canceled here, loadRates is never issued when the client already left
  const rates = yield* cancAwait(loadRates(roomIds, date));
  const rateAmounts = rates.map((rate) => rate.amount);
  const averageRate =
    rateAmounts.length ? rateAmounts.reduce((sum, amount) => sum + amount, 0) / rateAmounts.length : 0;

  // canceled here, the aggregate query is skipped for a dead socket
  const occupancy = yield* cancAwait(aggregateOccupancy(roomIds, date));

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
