// Zustand store, plain promises. Switching albums fast has no way to drop the loser: every
// loadAlbum call keeps running to completion, so the store guards itself with a request-id
// staleness check instead (the standard zustand-folk workaround for this problem).

import { create } from 'zustand';
import { mediaApi } from './mock/media-api';
import type { LibraryState } from './types';

export const useLibraryStore = create<LibraryState>((set, get) => {
 let latestId = 0;

 return {
 albums: [],
 currentAlbumId: null,
 tracks: [],
 status: 'idle',

 loadAlbum(albumId) {
 const id = ++latestId;
 set({ currentAlbumId: albumId, tracks: [], status: 'loading' });

 // stale guard #1 — the request still completed on the wire, only the state write is skipped
 mediaApi.tracks(albumId).then((tracks) => {
 if (id !== latestId) return;
 set({ tracks, status: 'loaded' });
 });
 },

 reset() {
 // stale guard #2 — bumping latestId with nothing pending is a no-op; any load already in
 // flight keeps running and its result is discarded when it lands (see guard #1 above)
 latestId++;
 set({ albums: [], currentAlbumId: null, tracks: [], status: 'idle' });
 },
 };
});

export async function loadAlbums(): Promise<void> {
 const albums = await mediaApi.albums();
 useLibraryStore.setState({ albums });
}
