import { useEffect, useState } from 'react';
import { Radio, Wifi, WifiOff } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';
import { getMarketStatus } from '../utils/marketStatus.js';

export function MarketStatusPill() {
  const { t } = useI18n();
  const [status, setStatus] = useState(getMarketStatus);

  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 30000);
    return () => clearInterval(id);
  }, []);

  const tone = status.isOpen ? 'bg-up/15 text-up' : 'bg-raised text-muted';

  return (
    <span className={`chip ${tone}`} title={`HOSE ${status.hours} ${status.timezone} · ${status.localTime}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status.isOpen ? 'live-dot bg-up' : 'bg-muted'}`} aria-hidden="true" />
      {t(status.labelKey)}
    </span>
  );
}

export function DataSourcePill({ realtime }) {
  const { t } = useI18n();
  return (
    <span className={`chip ${realtime ? 'bg-up/15 text-up' : 'bg-warn/15 text-warn'}`} title={realtime ? t('market.liveData') : t('market.sampleData')}>
      {realtime ? <Wifi size={12} /> : <WifiOff size={12} />}
      <span className="hidden sm:inline">{realtime ? t('market.liveShort') : t('market.sampleShort')}</span>
    </span>
  );
}

export function ServicePill({ label, online }) {
  return (
    <span className={`chip ${online ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
      <Radio size={12} className={online ? 'animate-pulse-slow' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export default MarketStatusPill;
