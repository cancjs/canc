// Zustand store, canc. currentLoad holds the in-flight CancelablePromise; loadAlbum cancels it
// first so switching albums is one line, and state is only ever written from the run that survived.

import { create } from 'zustand';
import { CancelablePromise } from '@cancjs/promise';
import { mediaApi } from './mock/media-api';
import type { LibraryState } from './types';

interface CancLibraryState extends LibraryState {
 currentLoad: CancelablePromise<void> | null;
}

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

 const load = new CancelablePromise<void>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 mediaApi.tracks(albumId, controller.signal).then((tracks) => {
 set({ tracks, status: 'loaded' });
 resolve();
 }, reject);
 handleCancel(() => controller.abort());
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

export async function loadAlbums(): Promise<void> {
 const albums = await mediaApi.albums();
 useLibraryStore.setState({ albums });
}
