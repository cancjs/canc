import { findRooms, loadRates, aggregateOccupancy } from './mock/db';
import { AvailabilityResult } from './availability';

// Plain uncancelable availability search: find rooms, load their rates, aggregate occupancy.
// A dropped connection cannot stop this. Once the first query starts, every step below runs to
// completion and the result is thrown away. The workaround-flavor comparison (AbortController
// threading, staleness flags) lives in the express-kysely example; here vanilla stays plain so
// the canc twin's ambient cancellation stands out on its own.
export async function searchAvailability(
 hotelId: string,
 date: string
): Promise<AvailabilityResult> {
 const rooms = await findRooms(hotelId, date);
 const roomIds = rooms.map((r) => r._id);

 // no cancellation counterpart, this always runs even if the client already left
 const rates = await loadRates(roomIds, date);
 const averageRate = rates.length
 ? rates.reduce((sum, r) => sum + r.amount, 0) / rates.length
 : 0;

 // no cancellation counterpart, the aggregate keeps querying for a dead socket
 const occupancy = await aggregateOccupancy(roomIds, date);

 // result is returned to nobody when the connection is already closed
 return {
 hotelId,
 date,
 roomsFound: rooms.length,
 averageRate,
 occupancy,
 };
}
