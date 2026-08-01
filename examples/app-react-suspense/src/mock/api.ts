// Aux code: a fake travel API for the example, built on the shared MockApi engine so cancellation
// reaches a simulated network boundary (started/aborted markers land in `api.calls`). Pretend this
// is your backend. This is scaffolding, not a copy target.

import { type AbortSignalLike, MockApi } from '@shared/mock-api';

export interface Destination {
  id: string;
  city: string;
  code: string;
}

export interface DestinationDetails {
  id: string;
  city: string;
  code: string;
  nextDeparture: string;
  gate: string;
  onTimeRate: number;
}

const DESTINATIONS: Destination[] = [
  { id: 'jfk', city: 'New York', code: 'JFK' },
  { id: 'lax', city: 'Los Angeles', code: 'LAX' },
  { id: 'lhr', city: 'London', code: 'LHR' },
  { id: 'lis', city: 'Lisbon', code: 'LIS' },
  { id: 'nrt', city: 'Tokyo', code: 'NRT' },
];

const GATES = ['A12', 'B4', 'C22', 'D7'];

export interface TravelApi {
  /** The shared call log. `aborted` markers here prove a cancel reached the fake network. */
  readonly calls: MockApi['calls'];
  listDestinations(signal?: AbortSignalLike): Promise<Destination[]>;
  destinationDetails(id: string, signal?: AbortSignalLike): Promise<DestinationDetails>;
}

/**
 * Builds a travel API over one MockApi instance. `latency` lets a test drive timing; the default
 * is high enough that a user can abandon a details load before it settles (the whole point of the
 * suspense-cancel story).
 */
export function createTravelApi(options: { latency?: number; trace?: (line: string) => void } = {}): TravelApi {
  const api = new MockApi({ latency: options.latency ?? 500, jitter: 0, trace: options.trace });

  return {
    calls: api.calls,
    listDestinations: (signal) => api.respond('travel.listDestinations', {}, () => DESTINATIONS.slice(), signal),
    destinationDetails: (id, signal) =>
      api.respond(
        'travel.destinationDetails',
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
        signal,
      ),
  };
}
