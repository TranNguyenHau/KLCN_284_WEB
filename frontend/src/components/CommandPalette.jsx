import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command as CommandIcon, CornerDownLeft, Download, Moon, Search, Sparkles, Sun, TrendingUp } from 'lucide-react';
import { api } from '../services/api.js';
import { useI18n } from '../i18n/index.jsx';
import { useTheme } from '../hooks/useTheme.jsx';
import { readRecents, rememberSymbol } from '../utils/recents.js';

/** Cheap relevance score: earlier and shorter matches win, 0 means no match. */
function score(text, query) {
  if (!query) return 1;
  const index = String(text).toLowerCase().indexOf(query.toLowerCase());
  return index === -1 ? 0 : 100 - index - String(text).length / 100;
}

export default function CommandPalette({ open, onClose, contextSymbol }) {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState([]);
  const [recents] = useState(readRecents);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    api.searchStocks('').then(setStocks).catch(() => setStocks([]));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActive(0);
    const focus = setTimeout(() => inputRef.current?.focus(), 20);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(focus);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const go = (to) => {
    onClose();
    navigate(to);
  };

  const askAlpha = (prompt) => {
    onClose();
    window.dispatchEvent(new CustomEvent('alpha:ask', { detail: { prompt } }));
  };

  const exportCsv = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('alpha:export', { detail: { format: 'csv' } }));
  };

  const sections = useMemo(() => {
    const q = query.trim();

    const pageItems = [
      { id: 'page-dashboard', label: t('nav.dashboard'), icon: TrendingUp, run: () => go('/') },
      { id: 'page-analysis', label: t('nav.analysis'), icon: Search, run: () => go(contextSymbol ? `/analysis/${contextSymbol}` : '/analysis/VIC') },
      { id: 'page-portfolio', label: t('nav.portfolio'), icon: Search, run: () => go('/portfolio') },
      { id: 'page-trading', label: t('nav.trading'), icon: Search, run: () => go('/trading') },
      { id: 'page-news', label: t('nav.news'), icon: Search, run: () => go('/news') }
    ].filter((page) => score(page.label, q) > 0);

    const byId = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const recentItems = q
      ? []
      : recents.map((symbol) => ({
          id: `recent-${symbol}`,
          label: symbol,
          hint: byId.get(symbol)?.name,
          icon: TrendingUp,
          run: () => {
            rememberSymbol(symbol);
            go(`/stock/${symbol}`);
          }
        }));

    const stockItems = stocks
      .map((stock) => ({ stock, s: Math.max(score(stock.symbol, q) * 1.5, score(stock.name, q)) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, q ? 8 : 6)
      .map(({ stock }) => ({
        id: `stock-${stock.symbol}`,
        label: stock.symbol,
        hint: stock.name,
        icon: TrendingUp,
        run: () => {
          rememberSymbol(stock.symbol);
          go(`/stock/${stock.symbol}`);
        }
      }));

    const actionItems = [
      { id: 'act-theme', label: t('search.actionToggleTheme'), icon: theme === 'dark' ? Sun : Moon, run: () => { toggle(); onClose(); } },
      ...(contextSymbol ? [{ id: 'act-export', label: t('search.actionExportCsv'), icon: Download, run: exportCsv }] : [])
    ].filter((action) => score(action.label, q) > 0);

    const aiItems = q ? [{ id: 'ask-ai', label: t('search.askAi', { query: q }), prompt: q, icon: Sparkles, run: () => askAlpha(q) }] : [];

    return [
      { key: 'pages', title: t('search.pages'), items: pageItems },
      { key: 'stocks', title: t('search.stocks'), items: recentItems.length ? [...recentItems, ...stockItems] : stockItems },
      { key: 'actions', title: t('search.actions'), items: actionItems },
      { key: 'ai', title: t('search.ai'), items: aiItems }
    ].filter((section) => section.items.length > 0);
  }, [query, stocks, recents, t, theme, contextSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, flat.length]);

  const runAt = (index) => {
    const item = flat[index];
    if (item) item.run();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runAt(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="glass fade-in-up w-full max-w-xl overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.paletteTitle')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
          <Search size={17} className="text-muted" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            placeholder={t('search.palettePlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('search.palettePlaceholder')}
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:flex">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">{query ? t('search.noMatches', { query }) : t('search.emptyQuery')}</p>}

          {sections.map((section) => (
            <div key={section.key} className="mb-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{section.title}</p>
              <ul>
                {section.items.map((item) => {
                  cursor += 1;
                  const index = cursor;
                  const Icon = item.icon || Search;
                  const selected = index === active;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-index={index}
                        tabIndex={-1}
                        onMouseMove={() => setActive(index)}
                        onClick={() => item.run()}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-raised'}`}
                      >
                        <Icon size={15} className={selected ? 'text-accent' : 'text-muted'} />
                        <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                        {item.hint && <span className="hidden max-w-[45%] truncate text-xs text-muted sm:inline">{item.hint}</span>}
                        {selected && <CornerDownLeft size={13} className="text-muted" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-line/70 px-4 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-line px-1.5 py-0.5">↑</kbd>
            <kbd className="rounded border border-line px-1.5 py-0.5">↓</kbd>
            {t('search.hintNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-line px-1.5 py-0.5">↵</kbd>
            {t('search.hintSelect')}
          </span>
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <CommandIcon size={12} />
            K
          </span>
        </div>
      </div>
    </div>
  );
}
