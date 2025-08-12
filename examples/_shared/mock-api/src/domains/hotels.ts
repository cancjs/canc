import { MockApi, AbortSignalLike } from '../core';
import { clone } from '@shared/util';

export interface Hotel {
 id: string;
 name: string;
 city: string;
 nightly: number;
}

const HOTELS: Hotel[] = [
 { id: 'h1', name: 'The Grand', city: 'Paris', nightly: 240 },
 { id: 'h2', name: 'Seaside Inn', city: 'Nice', nightly: 130 },
];

export interface HotelsApi {
 search(city: string, signal?: AbortSignalLike): Promise<Hotel[]>;
}

export function createHotelsApi(api: MockApi): HotelsApi {
 return {
 search: (city, signal) =>
 api.respond('hotels.search', { city }, () => clone(HOTELS.filter((h) => h.city === city)), signal),
 };
}
