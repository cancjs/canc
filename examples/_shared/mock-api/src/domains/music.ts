import { clone } from '@shared/util';

import { AbortSignalLike, MockApi } from '../core';

export interface Album {
  id: string;
  title: string;
  artist: string;
}
export interface Track {
  id: string;
  title: string;
  albumId: string;
}

const ALBUMS: Album[] = [
  { id: 'a1', title: 'Kind of Blue', artist: 'Miles Davis' },
  { id: 'a2', title: 'Blue Train', artist: 'John Coltrane' },
];
const TRACKS: Track[] = [
  { id: 't1', title: 'So What', albumId: 'a1' },
  { id: 't2', title: 'Freddie Freeloader', albumId: 'a1' },
  { id: 't3', title: 'Blue Train', albumId: 'a2' },
];

export interface MusicApi {
  albums(signal?: AbortSignalLike): Promise<Album[]>;
  tracks(albumId: string, signal?: AbortSignalLike): Promise<Track[]>;
}

export function createMusicApi(api: MockApi): MusicApi {
  return {
    albums: (signal) => api.respond('music.albums', {}, () => clone(ALBUMS), signal),
    tracks: (albumId, signal) =>
      api.respond('music.tracks', { albumId }, () => clone(TRACKS.filter((t) => t.albumId === albumId)), signal),
  };
}
