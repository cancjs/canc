import * as canc from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';

import { AvailabilityResult } from './availability';
import { findRooms, loadRates, scanBookings } from './bookings-repository';

// cancelify wraps repository calls so cancel stops chain
const findHotelRooms = cancelify(({ getSignal }, hotelId: string) => findRooms(hotelId, { signal: getSignal() }));
const loadRoomRates = cancelify(({ getSignal }, roomIds: string[], date: string) =>
  loadRates(roomIds, date, { signal: getSignal() }),
);
const scanRoomBookings = cancelify(({ getSignal }, roomIds: string[], date: string) =>
  scanBookings(roomIds, date, { signal: getSignal() }),
);

// cancelable availability search stops between queries on disconnect
export const searchAvailability = canc.async(function* (hotelId: string, date: string) {
  const rooms = yield* canc.await(findHotelRooms(hotelId));
  const roomIds = rooms.map((room) => room._id);

  // canceled here, loadRates is never issued when the client already left
  const rates = yield* canc.await(loadRoomRates(roomIds, date));
  const rateAmounts = rates.map((rate) => rate.amount);
  const averageRate =
    rateAmounts.length ? rateAmounts.reduce((sum, amount) => sum + amount, 0) / rateAmounts.length : 0;

  // canceled here, scan stops at current booking on disconnect
  const occupancy = yield* canc.await(scanRoomBookings(roomIds, date));

  // nothing below runs once canceled
  const result: AvailabilityResult = {
    hotelId,
    date,
    roomsFound: rooms.length,
    averageRate,
    occupancy,
  };
  return result;
});
