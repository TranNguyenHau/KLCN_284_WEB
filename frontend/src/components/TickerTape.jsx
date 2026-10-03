import { TrendingDown, TrendingUp } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';
import { fmtPct, fmtPrice, trendClass } from '../utils/format.js';

function TickerRow({ items, hidden }) {
  return (
    <ul className="flex shrink-0 items-center gap-6 px-4" aria-hidden={hidden || undefined}>
      {items.map((index) => {
        const up = index.changePercent >= 0;
        const Icon = up ? TrendingUp : TrendingDown;
        return (
          <li key={index.symbol} className="flex items-center gap-2 whitespace-nowrap text-xs">
            <span className="font-semibold tracking-wide">{index.symbol}</span>
            <span className="text-muted">{fmtPrice(index.value, 2)}</span>
            <span className={`inline-flex items-center gap-1 font-medium ${trendClass(index.changePercent)}`}>
              <Icon size={12} />
              {fmtPct(index.changePercent)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function TickerTape({ indices = [] }) {
  const { t } = useI18n();
  if (!indices.length) return null;

  return (
    // Opaque strip: it sits outside the blurred header, so translucent text would bleed.
    <div className="ticker-mask relative overflow-hidden border-b border-line/60 bg-surface" role="marquee" aria-label={t('a11y.tickerTape')}>
      <div className="ticker-track py-1.5">
        <TickerRow items={indices} />
        <TickerRow items={indices} hidden />
      </div>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" aria-hidden="true" />
    </div>
  );
}
