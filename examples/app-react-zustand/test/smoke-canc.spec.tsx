import { act, render, screen, waitFor } from '@testing-library/react';

import { Library } from '../src/Library-canc';
import { mockCalls } from '../src/mock/media-api';
import { useLibraryStore } from '../src/store-canc';

describe('app-react-zustand canc', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    useLibraryStore.setState({
      albums: [],
      currentAlbumId: null,
      tracks: [],
      status: 'idle',
      currentLoad: null,
    });
  });

  it('switching albums fast cancels the loser: state settles on the second album, first is aborted', async () => {
    const view = render(<Library />);
    await waitFor(() => expect(screen.getByTestId('album-a1')).toBeInTheDocument());

    act(() => {
      screen.getByTestId('album-a1').click();
    });
    act(() => {
      screen.getByTestId('album-a2').click();
    });

    await waitFor(() => expect(useLibraryStore.getState().status).toBe('loaded'));

    expect(useLibraryStore.getState().currentAlbumId).toBe('a2');
    expect(useLibraryStore.getState().tracks.every((track) => track.albumId === 'a2')).toBe(true);

    const trackCalls = mockCalls.filter((call) => call.endpoint === 'music.tracks');
    expect(trackCalls.some((call) => call.status === 'aborted')).toBe(true);
    expect(trackCalls.find((call) => call.status === 'completed')?.args).toEqual({ albumId: 'a2' });

    view.unmount();
  });

  it('unmount cancels an outstanding load', async () => {
    const view = render(<Library />);
    await waitFor(() => expect(screen.getByTestId('album-a1')).toBeInTheDocument());

    act(() => {
      screen.getByTestId('album-a1').click();
    });

    view.unmount();

    await waitFor(() => {
      const trackCalls = mockCalls.filter((call) => call.endpoint === 'music.tracks');
      expect(trackCalls.some((call) => call.status === 'aborted')).toBe(true);
    });
  });
});
