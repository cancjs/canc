// Zustand store with canc; currentLoad cancels previous in-flight requests

import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { create } from 'zustand';

import { mediaApi } from './mock/media-api';
import type { LibraryState } from './types';

interface CancLibraryState extends LibraryState {
  currentLoad: CancelablePromise<void> | null;
}

// getSignal() called on start; uncanceled load wires no AbortController
const loadTracks = cancelify(({ getSignal }, albumId: string) => mediaApi.tracks(albumId, getSignal()));
const loadAlbumsList = cancelify(({ getSignal }) => mediaApi.albums(getSignal()));

export const useLibraryStore = create<CancLibraryState>((set, get) => ({
  albums: [],
  currentAlbumId: null,
  tracks: [],
  status: 'idle',
  currentLoad: null,

  loadAlbum(albumId) {
    // canceled here: switching albums cancels whatever load was still in flight, one line
    get().currentLoad?.cancel();

    set({ currentAlbumId: albumId, tracks: [], status: 'loading' });

    const load = loadTracks(albumId).then((tracks) => {
      set({ tracks, status: 'loaded' });
    });

    set({ currentLoad: load });
  },

  reset() {
    // canceled here: unmount/reset cancels whatever load was still outstanding
    get().currentLoad?.cancel();
    set({ albums: [], currentAlbumId: null, tracks: [], status: 'idle', currentLoad: null });
  },
}));

export function loadAlbums(): CancelablePromise<void> {
  const load = loadAlbumsList().then((albums) => {
    useLibraryStore.setState({ albums });
  });
  return load;
}
