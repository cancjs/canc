import type { Album, Track } from './mock/media-api';

export type { Album, Track };

export interface LibraryState {
  albums: Album[];
  currentAlbumId: string | null;
  tracks: Track[];
  status: 'idle' | 'loading' | 'loaded';
  loadAlbum(albumId: string): void;
  reset(): void;
}
