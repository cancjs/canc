// Aux: mockingoose-backed data access with a query log. Pretend this is your repository
// layer talking to MongoDB. Each call is recorded so the tests can assert which queries the
// handler actually issued (and, on cancel, which ones it skipped). Black box for the reader.

import { sleep } from '@shared/util';
import { cancelify } from '@cancjs/toolbox';
import mockingoose from 'mockingoose';
import { RoomModel, RateModel, BookingModel, Room, Rate, Booking } from './models';

// Seed data for one hotel across two dates.
const ROOMS: Room[] = [
 { _id: 'r1', hotelId: 'grand-plaza', number: '101', capacity: 2 },
 { _id: 'r2', hotelId: 'grand-plaza', number: '102', capacity: 4 },
];

const RATES: Rate[] = [
 { _id: 'rate1', roomId: 'r1', date: '2026-08-01', amount: 180 },
 { _id: 'rate2', roomId: 'r2', date: '2026-08-01', amount: 260 },
];

const BOOKINGS: Booking[] = [
 { _id: 'b1', roomId: 'r1', date: '2026-08-01' },
];

export interface QueryEntry {
 op: 'findRooms' | 'loadRates' | 'aggregateOccupancy';
}

// One shared log per example run. Reset between scenarios/tests.
export const queryLog: QueryEntry[] = [];

export function resetQueryLog(): void {
 queryLog.length = 0;
}

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

// Raw Mongoose queries. Mongoose does not expose an AbortSignal on a query, so these stay plain
// promises: once a statement is sent to MongoDB it cannot be recalled from here. The cancelable
// wrappers below add chain-level cancellation (skip a query that has not started yet).
async function runFindRooms(hotelId: string): Promise<Room[]> {
 queryLog.push({ op: 'findRooms' });
 if (currentLatency) await sleep(currentLatency);
 return RoomModel.find({ hotelId }).lean().exec() as Promise<Room[]>;
}

async function runLoadRates(roomIds: string[], date: string): Promise<Rate[]> {
 queryLog.push({ op: 'loadRates' });
 if (currentLatency) await sleep(currentLatency);
 return RateModel.find({ roomId: { $in: roomIds }, date }).lean().exec() as Promise<Rate[]>;
}

async function runAggregateOccupancy(roomIds: string[], date: string): Promise<number> {
 queryLog.push({ op: 'aggregateOccupancy' });
 if (currentLatency) await sleep(currentLatency);
 const bookings = (await BookingModel.find({
 roomId: { $in: roomIds },
 date,
 })
 .lean()
 .exec()) as Booking[];
 return roomIds.length ? bookings.length / roomIds.length : 0;
}

// Cancelable repository boundary: canc-native versions of the queries above. The service awaits
// these directly and never threads a signal. Canceling the chain (client disconnect) stops it
// between steps, so a query that has not started yet is never issued.
export const findRooms = cancelify((_ctx, [hotelId]: [string, string]) => runFindRooms(hotelId));

export const loadRates = cancelify((_ctx, [roomIds, date]: [string[], string]) =>
 runLoadRates(roomIds, date)
);

export const aggregateOccupancy = cancelify(_ctx, [roomIds, date]: [string[], string]) =>
 runAggregateOccupancy(roomIds, date)
);
