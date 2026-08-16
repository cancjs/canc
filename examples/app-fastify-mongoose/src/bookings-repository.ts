// Plain Mongoose repository. Each function returns a plain promise with no canc imports.
// Cancellation is wired at the service boundary with cancelify.

import { sleep } from '@shared/util';

import { currentLatency, QueryEntry, queryLog } from './mock/db';
import { Booking, BookingModel, Rate, RateModel, Room, RoomModel } from './mock/models';

// Work spent on one booking document. Small enough to stay quick, large enough that a cancel
// lands between documents rather than after the whole scan.
const SCAN_STEP_MS = 5;

// Query-level abort, off by default. Turning it on passes the AbortSignal into the query options,
// and the driver then closes the cursor and stops the operation on the server.
const ABORT_QUERIES: boolean = false;

export async function findRooms(hotelId: string): Promise<Room[]> {
  // Query log is instrumentation for tests and console reports, not part of repository logic.
  queryLog.push({ op: 'findRooms' });
  if (currentLatency) await sleep(currentLatency);
  return RoomModel.find({ hotelId }).lean().exec() as Promise<Room[]>;
}

export async function loadRates(roomIds: string[], date: string): Promise<Rate[]> {
  // Query log is instrumentation for tests and console reports, not part of repository logic.
  queryLog.push({ op: 'loadRates' });
  if (currentLatency) await sleep(currentLatency);
  return RateModel.find({ roomId: { $in: roomIds }, date })
    .lean()
    .exec() as Promise<Rate[]>;
}

export interface ScanBookingsOptions {
  signal?: AbortSignal;
}

// Streams every booking of the given rooms and returns the occupancy of the given night, computed
// from the documents it actually got through.
export async function scanBookings(
  roomIds: string[],
  date: string,
  options: ScanBookingsOptions = {},
): Promise<number> {
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
