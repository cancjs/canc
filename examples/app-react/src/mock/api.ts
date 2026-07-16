// Aux code: a fake flight API for the example, built on the shared MockApi engine so cancellation
// really reaches a simulated network boundary (see the started/aborted markers in `api.calls`).
// Pretend this is your backend. This is scaffolding, not a copy target.
//
// The shared domains ship a `flights.search(from, to)` endpoint, but a destination typeahead needs
// query-by-text plus a per-flight details lookup, so those two endpoints are defined here on top of
// the same signal-aware `respond`. Latency is high enough that a burst of keystrokes overlaps in
// flight (the race the example is about).

import { MockApi, type AbortSignalLike } from '@shared/mock-api';

export interface FlightDestination {
 id: string;
 city: string;
 code: string;
}

export interface FlightDetails {
 id: string;
 city: string;
 code: string;
 nextDeparture: string;
 gate: string;
 onTimeRate: number;
}

const DESTINATIONS: FlightDestination[] = [
 { id: 'jfk', city: 'New York', code: 'JFK' },
 { id: 'lax', city: 'Los Angeles', code: 'LAX' },
 { id: 'lhr', city: 'London', code: 'LHR' },
 { id: 'lgw', city: 'London Gatwick', code: 'LGW' },
 { id: 'lis', city: 'Lisbon', code: 'LIS' },
 { id: 'sfo', city: 'San Francisco', code: 'SFO' },
 { id: 'sea', city: 'Seattle', code: 'SEA' },
 { id: 'nrt', city: 'Tokyo', code: 'NRT' },
];

const GATES = ['A12', 'B4', 'C22', 'D7'];

export interface FlightApi {
 /** The shared call log. `aborted` markers here prove a cancel reached the fake network. */
 readonly calls: MockApi['calls'];
 searchDestinations(query: string, signal?: AbortSignalLike): Promise<FlightDestination[]>;
 flightDetails(id: string, signal?: AbortSignalLike): Promise<FlightDetails>;
 /** Fire-and-forget: warm the details cache for a hovered row. No result is rendered. */
 warmDetails(id: string, signal?: AbortSignalLike): Promise<void>;
}

/**
 * Builds a flight API over one MockApi instance. `latency` lets a test drive timing; the default
 * gives a realistic feel where a fast typist outruns the search responses.
 */
export function createFlightApi(options: { latency?: number; trace?: (line: string) => void } = {}): FlightApi {
 const api = new MockApi({ latency: options.latency ?? 300, jitter: 0, trace: options.trace });

 return {
 calls: api.calls,
 searchDestinations: (query, signal) =>
 api.respond(
 'flights.searchDestinations',
 { query },
 () => {
 const needle = query.trim().toLowerCase();
 if (!needle) return [];
 return DESTINATIONS.filter(
 (d) => d.city.toLowerCase().includes(needle) || d.code.toLowerCase().includes(needle)
 );
 },
 signal
 ),
 flightDetails: (id, signal) =>
 api.respond(
 'flights.details',
 { id },
 () => {
 const found = DESTINATIONS.find((d) => d.id === id);
 if (!found) throw new Error(`no destination ${id}`);
 return {
 ...found,
 nextDeparture: `${8 + (found.code.charCodeAt(0) % 12)}:${found.code.charCodeAt(1) % 6}0`,
 gate: GATES[found.code.charCodeAt(0) % GATES.length],
 onTimeRate: 0.7 + (found.code.charCodeAt(2) % 30) / 100,
 };
 },
 signal
 ),
 warmDetails: (id, signal) =>
 api.respond('flights.warm', { id }, () => undefined, signal),
 };
}
