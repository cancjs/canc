import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { findRooms, loadRates, aggregateOccupancy } from './mock/db';
import { AvailabilityResult } from './availability';

// Cancelable availability search: find rooms, load their rates, aggregate occupancy.
// Cancellation is ambient. If the client disconnects while a query is in flight, the chain stops
// between steps: the remaining queries are never issued and the discarded result is never built.
// Mongoose cannot abort a statement already sent to the server (honesty note in the README), so
// this cancels at the chain level, skipping the queries that have not started yet.
export const searchAvailability = cancAsync(function* (
 hotelId: string,
 date: string
): Generator<unknown, AvailabilityResult, any> {
 const rooms = yield* cancAwait(findRooms(hotelId, date));
 const roomIds = rooms.map((r: { _id: string }) => r._id);

 // canceled here, loadRates is never issued when the client already left
 const rates = yield* cancAwait(loadRates(roomIds, date));
 const averageRate = rates.length
 ? rates.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0) / rates.length
 : 0;

 // canceled here, the aggregate query is skipped for a dead socket
 const occupancy = yield* cancAwait(aggregateOccupancy(roomIds, date));

 // nothing below runs once canceled, so the result is only built for a live connection
 return {
 hotelId,
 date,
 roomsFound: rooms.length,
 averageRate,
 occupancy,
 };
});
