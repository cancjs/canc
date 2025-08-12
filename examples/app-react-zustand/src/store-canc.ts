// Zustand store, canc. currentLoad holds the in-flight CancelablePromise; loadAlbum cancels it
// first so switching albums is one line, and state is only ever written from the run that survived.

import { create } from 'zustand';
import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { mediaApi } from './mock/media-api';
import type { LibraryState } from './types';

interface CancLibraryState extends LibraryState {
 currentLoad: CancelablePromise<void> | null;
}

// getSignal() is called only when a load is actually started, so an uncanceled load wires no
// AbortController at all.
const loadTracks = cancelify((getSignal, [albumId]: [string]) => mediaApi.tracks(albumId, getSignal()));
const loadAlbumsList = cancelify((getSignal) => mediaApi.albums(getSignal()));

export const useLibraryStore = create<CancLibraryState>((set, get) => ({
 albums: [],
 currentAlbumId: null,
 tracks: [],
 status: 'idle',
 currentLoad: null,

 loadAlbum(albumId) {
 // canceled here — switching albums cancels whatever load was still in flight, one line
 get().currentLoad?.cancel();

 set({ currentAlbumId: albumId, tracks: [], status: 'loading' });

 const load = loadTracks(albumId).then((tracks) => {
 set({ tracks, status: 'loaded' });
 });
 load.catch(() => {});

 set({ currentLoad: load });
 },

 reset() {
 // canceled here — unmount/reset cancels whatever load was still outstanding
 get().currentLoad?.cancel();
 set({ albums: [], currentAlbumId: null, tracks: [], status: 'idle', currentLoad: null });
 },
}));

export function loadAlbums(): CancelablePromise<void> {
 const load = loadAlbumsList().then((albums) => {
 useLibraryStore.setState({ albums });
 });
 load.catch(() => {});
 return load;
}
