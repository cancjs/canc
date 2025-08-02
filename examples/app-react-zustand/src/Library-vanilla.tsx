// Dumb, selector-driven component. All cancellation policy (or lack of it) lives in the store —
// this file only ever reads state and dispatches actions.

import { useEffect } from 'react';
import { useLibraryStore, loadAlbums } from './store-vanilla';

export function Library() {
 const albums = useLibraryStore((state) => state.albums);
 const currentAlbumId = useLibraryStore((state) => state.currentAlbumId);
 const tracks = useLibraryStore((state) => state.tracks);
 const status = useLibraryStore((state) => state.status);
 const loadAlbum = useLibraryStore((state) => state.loadAlbum);
 const reset = useLibraryStore((state) => state.reset);

 useEffect(() => {
 loadAlbums();
 // cancel in store, not in component — reset() is the store's own cleanup, called here only
 // as the unmount trigger (no cancellation counterpart — see Library-canc.tsx)
 return () => reset();
 }, []);

 return (
 <div>
 <h1>Media Library</h1>
 <ul data-testid="albums">
 {albums.map((album) => (
 <li key={album.id}>
 <button
 type="button"
 data-testid={`album-${album.id}`}
 aria-pressed={album.id === currentAlbumId}
 onClick={() => loadAlbum(album.id)}
 >
 {album.title} — {album.artist}
 </button>
 </li>
 ))}
 </ul>
 <div data-testid="status">{status}</div>
 <ul data-testid="tracks">
 {tracks.map((track) => (
 <li key={track.id}>{track.title}</li>
 ))}
 </ul>
 </div>
 );
}
