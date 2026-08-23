// plain Mongoose repository returning uncancelable promises
import { sleep } from '@shared/util';

import { currentLatency, QueryEntry, queryLog } from './mock/db';
import { Booking, BookingModel, Rate, RateModel, Room, RoomModel } from './mock/models';

// per-document scan delay to simulate work and allow mid-scan cancel
const SCAN_STEP_MS = 5;

// passes AbortSignal into Mongoose query options for query-level abort
const ABORT_QUERIES: boolean = true;

export interface QueryOptions {
  signal?: AbortSignal;
}

export async function findRooms(hotelId: string, options: QueryOptions = {}): Promise<Room[]> {
  // instrumentation query log for test assertions
  queryLog.push({ op: 'findRooms' });
  if (currentLatency) await sleep(currentLatency);
  const abortSignal = ABORT_QUERIES ? options.signal : undefined;
  return RoomModel.find({ hotelId }, null, { signal: abortSignal }).lean().exec() as Promise<Room[]>;
}

export async function loadRates(roomIds: string[], date: string, options: QueryOptions = {}): Promise<Rate[]> {
  // instrumentation query log for test assertions
  queryLog.push({ op: 'loadRates' });
  if (currentLatency) await sleep(currentLatency);
  const abortSignal = ABORT_QUERIES ? options.signal : undefined;
  return RateModel.find({ roomId: { $in: roomIds }, date }, null, { signal: abortSignal })
    .lean()
    .exec() as Promise<Rate[]>;
}

/** Streams bookings for given rooms and computes occupancy for target date. */
export async function scanBookings(roomIds: string[], date: string, options: QueryOptions = {}): Promise<number> {
  const entry: QueryEntry = { op: 'scanBookings', documentsScanned: 0 };
  queryLog.push(entry);
  if (currentLatency) await sleep(currentLatency);

  const abortSignal = ABORT_QUERIES ? options.signal : undefined;
  const bookingCursor = BookingModel.find({ roomId: { $in: roomIds } }, null, { signal: abortSignal })
    .lean()
    .cursor();

  let scanned = 0;
  let booked = 0;

  await bookingCursor.eachAsync(
    async (booking: Booking) => {
      await sleep(SCAN_STEP_MS);
      scanned += 1;
      if (booking.date === date) booked += 1;
      entry.documentsScanned = scanned;
    },
    { signal: options.signal },
  );

  return roomIds.length ? booked / roomIds.length : 0;
}
