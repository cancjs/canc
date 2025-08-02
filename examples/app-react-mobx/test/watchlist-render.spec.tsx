import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Watchlist } from '../src/Watchlist-canc';

describe('Watchlist (canc)', () => {
 it('renders the symbols and loads the selected one', async () => {
 render(<Watchlist />);
 expect(screen.getByRole('button', { name: 'BTC' })).toBeInTheDocument();

 fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
 await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('ETH'));
 });
});
