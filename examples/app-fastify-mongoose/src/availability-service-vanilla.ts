import { AvailabilityResult } from './availability';
import { findRooms, loadRates, scanBookings } from './bookings-repository';

// (no cancelable repository boundary, see -canc)

// uncancelable availability search runs every query to completion
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
