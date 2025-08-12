import { MockApi, AbortSignalLike } from '../core';
import { clone } from '@shared/util';

export interface Flight {
 id: string;
 from: string;
 to: string;
 price: number;
}

const FLIGHTS: Flight[] = [
 { id: 'f1', from: 'SFO', to: 'JFK', price: 320 },
 { id: 'f2', from: 'SFO', to: 'LAX', price: 90 },
 { id: 'f3', from: 'JFK', to: 'LHR', price: 540 },
];

export interface FlightsApi {
 search(from: string, to: string, signal?: AbortSignalLike): Promise<Flight[]>;
}

export function createFlightsApi(api: MockApi): FlightsApi {
 return {
 search: (from, to, signal) =>
 api.respond(
 'flights.search',
 { from, to },
 () => clone(FLIGHTS.filter((f) => f.from === from && f.to === to)),
 signal
 ),
 };
}
