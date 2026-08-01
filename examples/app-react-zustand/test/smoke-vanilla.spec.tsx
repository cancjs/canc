import { act, render, screen, waitFor } from '@testing-library/react';

import { Library } from '../src/Library-vanilla';
import { mockCalls } from '../src/mock/media-api';
import { useLibraryStore } from '../src/store-vanilla';

describe('app-react-zustand vanilla', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    useLibraryStore.setState({ albums: [], currentAlbumId: null, tracks: [], status: 'idle' });
  });

  it('switching albums fast has no cancel: both track requests complete on the wire', async () => {
    const view = render(<Library />);
    await waitFor(() => expect(screen.getByTestId('album-a1')).toBeInTheDocument());

    act(() => {
      screen.getByTestId('album-a1').click();
    });
    act(() => {
      screen.getByTestId('album-a2').click();
    });

    await waitFor(() => expect(useLibraryStore.getState().status).toBe('loaded'));

    // vanilla inverted: the stale guard only skips the STATE WRITE, the request itself always
    // completes (the bug we teach, not something to assert away)
    await waitFor(() => {
      const trackCalls = mockCalls.filter((call) => call.endpoint === 'music.tracks');
      expect(trackCalls.filter((call) => call.status === 'completed').length).toBe(2);
    });

    expect(useLibraryStore.getState().currentAlbumId).toBe('a2');
    expect(useLibraryStore.getState().tracks.every((track) => track.albumId === 'a2')).toBe(true);

    view.unmount();
  });
});
