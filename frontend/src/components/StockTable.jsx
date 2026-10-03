import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { fmtCompact, fmtPrice } from '../utils/format.js';
import { rememberSymbol } from '../utils/recents.js';
import PriceChange from './PriceChange.jsx';
import { SkeletonTable } from './Skeleton.jsx';
import { Empty } from './StatusViews.jsx';

/**
 * `stickyHeader` keeps the column titles visible while the caller scrolls the table
 * inside a capped container (see the dashboard lists). `className` is merged onto the
 * wrapper so callers can set a max height.
 *
 * `fill` makes the table take the full height of a container with a *fixed* height: the
 * browser then shares the spare height between the rows, which is how the dashboard mover
 * columns match the height of the watchlist next to them. Only use it with a bounded
 * container (a short list in an unbounded one would stretch into giant bands) - a list
 * that is already taller than the container simply scrolls instead.
 */
export default function StockTable({ rows, action, showVolume = true, loading = false, stickyHeader = false, fill = false, className = '' }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  if (loading) return <SkeletonTable rows={5} columns={showVolume ? 4 : 3} />;
  if (!rows?.length) return <Empty>{t('table.empty')}</Empty>;

  const open = (symbol) => {
    rememberSymbol(symbol);
    navigate(`/stock/${symbol}`);
  };

  const head = stickyHeader ? 'sticky top-0 z-10 bg-surface' : '';

  return (
    <div className={`overflow-x-auto ${fill ? 'h-full' : ''} ${className}`}>
      <table className={`w-full min-w-[320px] ${fill ? 'h-full' : ''}`}>
        <thead>
          <tr className="border-b border-line/70">
            <th className={`th ${head}`}>{t('table.symbol')}</th>
            <th className={`th text-right ${head}`}>{t('table.price')}</th>
            <th className={`th text-right ${head}`}>{t('table.change')}</th>
            {showVolume && <th className={`th hidden text-right sm:table-cell ${head}`}>{t('table.volume')}</th>}
            {action && <th className={`th ${head}`} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.symbol}
              className="cursor-pointer border-b border-line/40 transition-colors last:border-0 hover:bg-raised/70"
              onClick={() => open(row.symbol)}
            >
              <td className="td">
                <div className="font-semibold">{row.symbol}</div>
                <div className="max-w-[140px] truncate text-xs text-muted">{row.name}</div>
              </td>
              <td className="td text-right">{fmtPrice(row.price)}</td>
              <td className="td text-right">
                <PriceChange percent={row.changePercent} showIcon={false} />
              </td>
              {showVolume && <td className="td hidden text-right text-muted sm:table-cell">{fmtCompact(row.volume)}</td>}
              {action && (
                <td className="td text-right" onClick={(event) => event.stopPropagation()}>
                  {action(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
