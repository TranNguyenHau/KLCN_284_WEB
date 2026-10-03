import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../services/api.js';
import { useI18n } from '../i18n/index.jsx';
import { rememberSymbol } from '../utils/recents.js';

export default function SearchBox({ className = '' }) {
  const { t } = useI18n();
  const [stocks, setStocks] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.searchStocks('').then(setStocks).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (event) => ref.current && !ref.current.contains(event.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return stocks.filter((stock) => !term || stock.symbol.toLowerCase().includes(term) || stock.name.toLowerCase().includes(term)).slice(0, 8);
  }, [stocks, query]);

  const go = (symbol) => {
    setOpen(false);
    setQuery('');
    rememberSymbol(symbol);
    navigate(`/stock/${symbol}`);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
      <input
        className="input pl-9"
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => event.key === 'Enter' && matches[0] && go(matches[0].symbol)}
        aria-label={t('search.ariaLabel')}
      />
      {open && (
        <ul className="glass absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl p-1">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('search.noResults')}</li>}
          {matches.map((stock) => (
            <li key={stock.symbol}>
              <button className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-raised" onClick={() => go(stock.symbol)}>
                <span className="font-semibold">{stock.symbol}</span>
                <span className="truncate text-muted">{stock.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
