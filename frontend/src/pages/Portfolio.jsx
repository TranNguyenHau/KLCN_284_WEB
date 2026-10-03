import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bell, Trash2, X } from 'lucide-react';
import { Card, CardHeader } from '../components/Card.jsx';
import { Empty, ErrorBox, LoadingBlock } from '../components/StatusViews.jsx';
import StockTable from '../components/StockTable.jsx';
import Stat from '../components/Stat.jsx';
import ChartTooltip from '../components/charts/ChartTooltip.jsx';
import { SkeletonStat } from '../components/Skeleton.jsx';
import { useApi } from '../hooks/useApi.js';
import { useChartColors } from '../hooks/useChartColors.js';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { fmtCompact, fmtMoney, fmtPct, fmtPrice, shortDate, trendClass } from '../utils/format.js';

/** Long amounts ("500.000.000 VND") are normal here, so the tile wraps instead of clipping. */
function Metric({ label, value, tone, sub }) {
  return (
    <Card className="overflow-hidden px-4 py-3" hover>
      <Stat label={label} value={value} tone={tone} sub={sub} valueClassName="sm:text-xl" />
    </Card>
  );
}

function AlertsCard() {
  const { t } = useI18n();
  const alerts = useApi(api.alerts, []);
  const stocks = useApi(() => api.searchStocks(''), []);
  const [form, setForm] = useState({ symbol: 'VIC', condition: 'above', price: '' });
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      await api.addAlert({ ...form, price: Number(form.price) });
      setForm({ ...form, price: '' });
      alerts.reload();
    } catch (ex) {
      setError(ex);
    }
  };

  return (
    <Card>
      <CardHeader title={t('alerts.sectionTitle')} subtitle={t('alerts.evaluatedOnLoad')} right={<Bell size={16} className="text-muted" />} />
      <form className="grid grid-cols-2 gap-2 border-b border-line/70 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={submit}>
        <select className="input" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} aria-label={t('common.symbol')}>
          {(stocks.data || [{ symbol: 'VIC' }]).map((stock) => (
            <option key={stock.symbol}>{stock.symbol}</option>
          ))}
        </select>
        <select className="input" value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })} aria-label={t('common.condition')}>
          <option value="above">{t('alerts.conditionAbove')}</option>
          <option value="below">{t('alerts.conditionBelow')}</option>
        </select>
        <input
          className="input"
          type="number"
          min="1"
          step="any"
          placeholder={t('alerts.targetPrice')}
          value={form.price}
          onChange={(event) => setForm({ ...form, price: event.target.value })}
          required
          aria-label={t('alerts.targetPrice')}
        />
        <button className="btn btn-primary" type="submit">
          {t('alerts.create')}
        </button>
      </form>
      {error && <ErrorBox error={error} />}
      {alerts.loading && !alerts.data && <LoadingBlock height="h-20" />}
      {alerts.data?.length === 0 && <Empty>{t('alerts.empty')}</Empty>}
      <ul className="divide-y divide-line/60">
        {alerts.data?.map((alert) => (
          <li key={alert.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <span className="font-semibold">{alert.symbol}</span> {t(alert.condition === 'above' ? 'alerts.conditionAbove' : 'alerts.conditionBelow')} {fmtPrice(alert.price)}
              <div className="text-xs text-muted">{t('alerts.current', { price: fmtPrice(alert.currentPrice) })}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`chip ${alert.triggered ? 'bg-warn/15 text-warn' : 'bg-raised text-muted'}`}>{t(alert.triggered ? 'alerts.triggered' : 'alerts.waiting')}</span>
              <button
                className="text-muted transition-colors hover:text-down"
                onClick={async () => {
                  await api.removeAlert(alert.id);
                  alerts.reload();
                }}
                aria-label={t('alerts.remove')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Portfolio() {
  const { t } = useI18n();
  const c = useChartColors();
  const { data, loading, error, reload } = useApi(api.portfolio, []);
  const watch = useApi(api.watchlist, []);
  // The subtitle embeds a link, so the template is split around {link} before interpolation.
  const [subtitleBefore, subtitleAfter] = t('portfolio.subtitle').split('{link}');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t('portfolio.title')}</h1>
        <p className="text-sm text-muted">
          {subtitleBefore}
          <Link className="text-accent hover:underline" to="/trading">
            {t('portfolio.paperTradingLink')}
          </Link>
          {subtitleAfter}
        </p>
      </div>

      {loading && !data && <SkeletonStat count={4} />}
      {error && (
        <Card>
          <ErrorBox error={error} onRetry={reload} />
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label={t('portfolio.totalEquity')} value={fmtMoney(data.totalEquity)} />
            <Metric label={t('portfolio.cash')} value={fmtMoney(data.cash)} />
            <Metric label={t('portfolio.unrealizedPnl')} value={fmtMoney(data.unrealizedPnl)} tone={trendClass(data.unrealizedPnl)} sub={fmtPct(data.unrealizedPnlPercent)} />
            <Metric label={t('portfolio.realizedPnl')} value={fmtMoney(data.realizedPnl)} tone={trendClass(data.realizedPnl)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader title={t('portfolio.holdings')} />
              {data.holdings.length === 0 ? (
                <Empty>{t('portfolio.holdingsEmpty')}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-line/70">
                        {[t('common.symbol'), t('portfolio.qty'), t('portfolio.avgCost'), t('common.price'), t('common.value'), t('portfolio.pl')].map((header, i) => (
                          <th key={header} className={`th ${i ? 'text-right' : ''}`}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.holdings.map((holding) => (
                        <tr key={holding.symbol} className="border-b border-line/40 transition-colors last:border-0 hover:bg-raised/70">
                          <td className="td">
                            <Link className="font-semibold hover:text-accent" to={`/stock/${holding.symbol}`}>
                              {holding.symbol}
                            </Link>
                          </td>
                          <td className="td text-right">{fmtPrice(holding.quantity)}</td>
                          <td className="td text-right">{fmtPrice(holding.avgCost)}</td>
                          <td className="td text-right">{fmtPrice(holding.price)}</td>
                          <td className="td text-right">{fmtCompact(holding.marketValue)}</td>
                          <td className={`td text-right font-medium ${trendClass(holding.unrealizedPnl)}`}>
                            {fmtCompact(holding.unrealizedPnl)} ({fmtPct(holding.unrealizedPnlPercent)})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title={t('portfolio.performance')} subtitle={t('portfolio.performanceSubtitle')} />
              <div className="p-3">
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={data.performance} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="2 6" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: c.axis, fontSize: 11 }} minTickGap={40} stroke={c.grid} />
                    <YAxis domain={['auto', 'auto']} tickFormatter={fmtCompact} tick={{ fill: c.axis, fontSize: 11 }} width={52} stroke={c.grid} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area dataKey="value" name={t('portfolio.holdingsValue')} stroke={c.accent} fill={c.accent} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('portfolio.watchlist')} />
              {watch.loading && !watch.data && <LoadingBlock height="h-24" />}
              {watch.error && <ErrorBox error={watch.error} onRetry={watch.reload} />}
              {watch.data && (
                // Same rule as the dashboard: a list that grows scrolls, it does not stretch
                // the card or the row it sits in.
                <div className="max-h-[440px] overflow-y-auto">
                  <StockTable
                    rows={watch.data}
                    showVolume={false}
                    stickyHeader
                    action={(row) => (
                      <button
                        className="text-muted transition-colors hover:text-down"
                        onClick={async () => {
                          await api.removeWatch(row.symbol);
                          watch.reload();
                        }}
                        aria-label={t('dashboard.removeFromWatchlist', { symbol: row.symbol })}
                      >
                        <X size={14} />
                      </button>
                    )}
                  />
                </div>
              )}
            </Card>
            <AlertsCard />
          </div>
        </>
      )}
    </div>
  );
}
