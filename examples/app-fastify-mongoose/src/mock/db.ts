// seed data and test instrumentation
import mockingoose from 'mockingoose';

import { Booking, BookingModel, Rate, RateModel, Room, RoomModel } from './models';

// seed data for one hotel
const ROOMS: Room[] = [
  { _id: 'r1', hotelId: 'grand-plaza', number: '101', capacity: 2 },
  { _id: 'r2', hotelId: 'grand-plaza', number: '102', capacity: 4 },
];

const RATES: Rate[] = [
  { _id: 'rate1', roomId: 'r1', date: '2026-08-01', amount: 180 },
  { _id: 'rate2', roomId: 'r2', date: '2026-08-01', amount: 260 },
];

const BOOKING_DATES = Array.from({ length: 20 }, (_, day) => `2026-08-${String(day + 1).padStart(2, '0')}`);

// one booking per room per night, grouped by room
const BOOKINGS: Booking[] = ROOMS.flatMap((room) =>
  BOOKING_DATES.map((date) => ({ _id: `${room._id}-${date}`, roomId: room._id, date })),
);

// total documents walked by full scan
export const BOOKING_COUNT = BOOKINGS.length;

export interface QueryEntry {
  op: 'findRooms' | 'loadRates' | 'scanBookings';
  documentsScanned?: number;
}

// shared query log reset between tests
export const queryLog: QueryEntry[] = [];

export function resetQueryLog(): void {
  queryLog.length = 0;
}

export let currentLatency = 0;

/** Installs mock Mongoose responses with optional query latency. */
export function installMocks(latencyMs = 0): void {
  mockingoose.resetAll();
  mockingoose(RoomModel).toReturn(ROOMS, 'find');
  mockingoose(RateModel).toReturn(RATES, 'find');
  mockingoose(BookingModel).toReturn(BOOKINGS, 'find');
  currentLatency = latencyMs;

  // cursor stand-in supporting abort signal options
  const mongoose = require('mongoose');
  const originalCursor = mongoose.Query.prototype.cursor;
  mongoose.Query.prototype.cursor = function (...args: any[]) {
    const cursor = originalCursor.apply(this, args);
    cursor.eachAsync = function (handler: (doc: any) => Promise<void>, options?: { signal?: AbortSignal }) {
      if (options?.signal?.aborted) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        let stopped = false;
        const onAbort = () => {
          stopped = true;
          resolve(null);
        };
        if (options?.signal) {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        const loop = async () => {
          try {
            let doc = await cursor.next();
            while (doc !== null) {
              if (stopped) break;
              // The handler already in flight when the abort lands runs to completion.
              await handler(doc);
              if (stopped) break;
              doc = await cursor.next();
            }
            options?.signal?.removeEventListener('abort', onAbort);
            if (!stopped) resolve(null);
          } catch (err) {
            reject(err);
          }
        };
        loop();
      });
    };
    return cursor;
  };
}
