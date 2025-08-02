import { observer } from 'mobx-react-lite';
import { useMemo } from 'react';
import { PortfolioStore } from './portfolio-store-canc';

// Watchlist view, canc store. Clicking a symbol calls store.select, which cancels the previous
// cancFlow run. The generator stops AND the previous symbol's request is aborted at the network
// (deep cancel), so no stale state is written for the abandoned symbol.
export const Watchlist = observer(function Watchlist() {
 const store = useMemo(() => new PortfolioStore(), []);
 return (
 <div className="watchlist">
 <nav>
 {store.symbols.map((symbol) => (
 <button
 key={symbol}
 className={symbol === store.selected ? 'active' : ''}
 onClick={() => store.select(symbol)}
 >
 {symbol}
 </button>
 ))}
 </nav>
 <section>
 {store.loading && <p>Loading {store.selected}...</p>}
 {store.loaded && (
 <div>
 <h2>
 {store.loaded.symbol} {store.loaded.quote.price}
 </h2>
 <p>{store.loaded.history.length} history points</p>
 </div>
 )}
 </section>
 </div>
 );
});
