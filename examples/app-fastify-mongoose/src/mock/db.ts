// Aux: mockingoose-backed data access with a query log. Pretend this is your repository
// layer talking to MongoDB. Each call is recorded so the tests can assert which queries the
// handler actually issued (and, on cancel, which ones it skipped). Black box for the reader.

import { sleep } from '@shared/util';
import mockingoose from 'mockingoose';

import { Booking, BookingModel, Rate, RateModel, Room, RoomModel } from './models';

// Seed data for one hotel.
const ROOMS: Room[] = [
  { _id: 'r1', hotelId: 'grand-plaza', number: '101', capacity: 2 },
  { _id: 'r2', hotelId: 'grand-plaza', number: '102', capacity: 4 },
];

const RATES: Rate[] = [
  { _id: 'rate1', roomId: 'r1', date: '2026-08-01', amount: 180 },
  { _id: 'rate2', roomId: 'r2', date: '2026-08-01', amount: 260 },
];

const BOOKING_DATES = Array.from({ length: 20 }, (_, day) => `2026-08-${String(day + 1).padStart(2, '0')}`);

// One booking per room per night, grouped by room. Occupancy for a single night is answered by
// walking all of them, which is what makes the scan long enough to be worth interrupting.
const BOOKINGS: Booking[] = ROOMS.flatMap((room) =>
  BOOKING_DATES.map((date) => ({ _id: `${room._id}-${date}`, roomId: room._id, date })),
);

// How many documents a full scan walks. Reported by the entries, asserted by the tests.
export const BOOKING_COUNT = BOOKINGS.length;

// Work spent on one booking document. Small enough to stay quick, large enough that a cancel
// lands between documents rather than after the whole scan.
const SCAN_STEP_MS = 5;

export interface QueryEntry {
  op: 'findRooms' | 'loadRates' | 'scanBookings';
  documentsScanned?: number;
}

// One shared log per example run. Reset between scenarios/tests.
export const queryLog: QueryEntry[] = [];

export function resetQueryLog(): void {
  queryLog.length = 0;
}

// Query-level abort, off by default. Turning it on passes the AbortSignal into the query options,
// and the driver then closes the cursor and stops the operation on the server. That is the path
// that drops the connection and opens a new one, so it suits an explicit user cancel better than
// the ambient cancellation of every disconnected request (README has the details and the ticket).
// mockingoose replaces the query executor and never reads the option, so flipping this changes
// nothing in this example.
const ABORT_QUERIES: boolean = false;

// Install the mock responses. mockingoose intercepts the real Mongoose model methods, so no
// running MongoDB is needed. `latencyMs` lets a test hold a query open long enough to cancel
// the chain mid-flight (deterministic, no real network).
export function installMocks(latencyMs = 0): void {
  mockingoose.resetAll();
  mockingoose(RoomModel).toReturn(ROOMS, 'find');
  mockingoose(RateModel).toReturn(RATES, 'find');
  mockingoose(BookingModel).toReturn(BOOKINGS, 'find');
  currentLatency = latencyMs;
}

let currentLatency = 0;

export async function findRooms(hotelId: string): Promise<Room[]> {
  queryLog.push({ op: 'findRooms' });
  if (currentLatency) await sleep(currentLatency);
  return RoomModel.find({ hotelId }).lean().exec() as Promise<Room[]>;
}

export async function loadRates(roomIds: string[], date: string): Promise<Rate[]> {
  queryLog.push({ op: 'loadRates' });
  if (currentLatency) await sleep(currentLatency);
  return RateModel.find({ roomId: { $in: roomIds }, date })
    .lean()
    .exec() as Promise<Rate[]>;
}

export interface ScanBookingsOptions {
  onDocument?: (booking: Booking) => void;
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
  const bookings = (await BookingModel.find({ roomId: { $in: roomIds } }, null, { signal: abortSignal })
    .lean()
    .exec()) as Booking[];

  // The loop implements the stop semantics of the driver's own cursor scan, because mockingoose
  // replaces the cursor with a stand-in that drops the options argument, signal included.
  let scanned = 0;
  let booked = 0;
  for (const booking of bookings) {
    if (options.signal?.aborted) break;
    await sleep(SCAN_STEP_MS);
    options.onDocument?.(booking);
    scanned += 1;
    if (booking.date === date) booked += 1;
    entry.documentsScanned = scanned;
  }

  return roomIds.length ? booked / roomIds.length : 0;
}
