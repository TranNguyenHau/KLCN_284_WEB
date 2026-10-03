import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { Activity, ArrowLeftRight, Command as CommandIcon, LayoutDashboard, Menu, Moon, Newspaper, PanelLeftClose, PanelLeftOpen, Search, Sun, Wallet, X } from 'lucide-react';
import AlphaChat from '../components/AlphaChat.jsx';
import CommandPalette from '../components/CommandPalette.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import MarketStatusPill, { DataSourcePill, ServicePill } from '../components/MarketStatusPill.jsx';
import TickerTape from '../components/TickerTape.jsx';
import { useTheme } from '../hooks/useTheme.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { api } from '../services/api.js';
import Footer from "../components/Footer";

const GROUPS = [
  { key: 'main', items: [{ to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true }] },
  {
    key: 'groupAnalysis',
    items: [
      { to: '/analysis/VIC', labelKey: 'nav.analysis', icon: Activity, match: '/analysis' },
      { to: '/news', labelKey: 'nav.news', icon: Newspaper }
    ]
  },
  {
    key: 'groupAccount',
    items: [
      { to: '/portfolio', labelKey: 'nav.portfolio', icon: Wallet },
      { to: '/trading', labelKey: 'nav.trading', icon: ArrowLeftRight }
    ]
  }
];

function NavList({ collapsed }) {
  const { t } = useI18n();
  const location = useLocation();

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {GROUPS.map((group) => (
        <div key={group.key}>
          {group.key !== 'main' && (
            <p className={`mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted ${collapsed ? 'sr-only' : ''}`}>{t(`nav.${group.key}`)}</p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map(({ to, labelKey, icon: Icon, end, match }) => {
              const active = match ? location.pathname.startsWith(match) : undefined;
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={collapsed ? t(labelKey) : undefined}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      (active ?? isActive) ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raised hover:text-ink'
                    } ${collapsed ? 'justify-center' : ''}`
                  }
                >
                  <Icon size={17} className="shrink-0" />
                  {!collapsed && <span className="truncate">{t(labelKey)}</span>}
                  {(active ?? false) && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function MainLayout() {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useLocalStorage('alpha.sidebar-collapsed', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [indices, setIndices] = useState([]);
  const location = useLocation();
  const stockMatch = useMatch('/stock/:symbol');
  const analysisMatch = useMatch('/analysis/:symbol');
  const contextSymbol = (stockMatch || analysisMatch)?.params.symbol?.toUpperCase();

  useEffect(() => {
    let alive = true;
    const poll = () => api.health().then((value) => alive && setHealth(value)).catch(() => alive && setHealth({ down: true }));
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = () => api.overview().then((value) => alive && setIndices(value.indices || [])).catch(() => {});
    poll();
    const id = setInterval(poll, 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A navigation should always look like a fresh page: close the overlays, drop any
  // stuck scroll lock and start at the top instead of keeping the old scroll offset.
  useEffect(() => {
    setMenu(false);
    setPaletteOpen(false);
    document.body.style.overflow = '';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  const ml = health?.ml;
  const mlPill = health
    ? health.down
      ? { label: t('health.apiOffline'), online: false }
      : ml.online && ml.modelReady
        ? { label: t('health.lstmReady'), online: true }
        : { label: ml.online ? t('health.lstmNotLoaded') : t('health.lstmOffline'), online: false }
    : null;

  const brand = (
    <Link to="/" className={`flex items-center gap-2 py-4 text-lg font-bold tracking-tight ${collapsed ? 'justify-center px-3' : 'px-5'}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-sm text-white dark:text-bg">α</span>
      {!collapsed && <span className="truncate">{t('app.name')}</span>}
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      <div className="ambient" aria-hidden="true" />
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line/70 bg-surface/50 backdrop-blur lg:flex ${collapsed ? 'w-[72px]' : 'w-[236px]'} transition-[width] duration-200 ease-smooth`}>
        {brand}
        <NavList collapsed={collapsed} />
        <button className="btn btn-ghost m-3 justify-center" onClick={() => setCollapsed((value) => !value)} aria-label={t(collapsed ? 'a11y.expandSidebar' : 'a11y.collapseSidebar')} title={t(collapsed ? 'a11y.expandSidebar' : 'a11y.collapseSidebar')}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </aside>

      {menu && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)}>
          <aside className="glass flex h-full w-72 flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-lg font-bold">
              {t('app.name')}
              <button className="btn btn-ghost btn-icon px-1.5 py-1.5" onClick={() => setMenu(false)} aria-label={t('a11y.closeMenu')}>
                <X size={16} />
              </button>
            </div>
            <NavList collapsed={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
         * Only the controls row gets backdrop blur. The animated ticker tape stays
         * outside that layer: a 45s animation inside a backdrop-filter forces the
         * browser to re-blur the whole strip every frame, which made the window
         * crawl on low-end machines.
         */}
        <header className="sticky top-0 z-20">
          <div className="border-b border-line/70 bg-surface/70 backdrop-blur-xl">
            <div className="flex items-center gap-2 px-3 py-2.5 lg:px-4">
              <button className="btn btn-ghost btn-icon px-2 lg:hidden" onClick={() => setMenu(true)} aria-label={t('a11y.openMenu')}>
                <Menu size={16} />
              </button>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface/70 px-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-ink sm:max-w-sm"
                aria-label={t('search.openPalette')}
              >
                <Search size={15} className="shrink-0" />
                <span className="flex-1 truncate text-left">{t('search.placeholder')}</span>
                <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-line px-1.5 py-0.5 text-[10px] sm:flex">
                  <CommandIcon size={10} />K
                </kbd>
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                <div className="hidden items-center gap-1.5 md:flex">
                  <MarketStatusPill />
                  <DataSourcePill realtime={health?.marketData?.realtime} />
                  {mlPill && <ServicePill {...mlPill} />}
                </div>
                <LanguageSwitcher />
                <button className="btn btn-ghost btn-icon px-2" onClick={toggle} aria-label={t('a11y.toggleTheme')}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-hidden px-3 pb-2 md:hidden">
              <MarketStatusPill />
              <DataSourcePill realtime={health?.marketData?.realtime} />
            </div>
          </div>

          <TickerTape indices={indices} />
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 lg:p-6">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <Footer/>
      </div>


      

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} contextSymbol={contextSymbol} />
      <AlphaChat />
      
    </div>
    
  );
  
}
