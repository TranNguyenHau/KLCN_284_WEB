import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Card, CardHeader } from '../components/Card.jsx';
import { Empty, ErrorBox, LoadingBlock, Spinner } from '../components/StatusViews.jsx';
import Stat from '../components/Stat.jsx';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { fmtMoney, fmtPct, fmtPercentValue, fmtPrice, getFormatLocale, trendClass } from '../utils/format.js';

function Field({ label, children }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <div className="mt-1 text-ink">{children}</div>
    </label>
  );
}

function OrderForm({ stocks, onDone }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ symbol: 'VIC', side: 'buy', quantity: 100 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const quote = useApi(() => api.stock(form.symbol), [form.symbol]);
  const estimate = quote.data ? quote.data.price * (Number(form.quantity) || 0) : null;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.placeOrder({ ...form, quantity: Number(form.quantity) }));
      onDone();
    } catch (ex) {
      setError(ex);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('trading.orderForm')} subtitle={t('trading.orderFormSubtitle')} />
      <form className="space-y-3 p-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.stock')}>
            <select className="input" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })}>
              {(stocks || [{ symbol: 'VIC' }]).map((stock) => (
                <option key={stock.symbol}>{stock.symbol}</option>
              ))}
            </select>
          </Field>
          <Field label={t('common.quantity')}>
            <input className="input" type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
          </Field>
        </div>
        <div className="inline-flex w-full rounded-lg border border-line p-0.5">
          {['buy', 'sell'].map((side) => (
            <button
              type="button"
              key={side}
              onClick={() => setForm({ ...form, side })}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                form.side === side ? (side === 'buy' ? 'bg-up text-white dark:text-bg' : 'bg-down text-white dark:text-bg') : 'text-muted hover:text-ink'
              }`}
            >
              {t(side === 'buy' ? 'trading.buy' : 'trading.sell')}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t('trading.marketPrice')}</span>
          <span>{quote.data ? fmtPrice(quote.data.price) : '-'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t('trading.estimatedValue')}</span>
          <span className="font-medium">{estimate != null ? fmtMoney(estimate) : '-'}</span>
        </div>
        <button className="btn btn-primary w-full" disabled={busy || !quote.data} type="submit">
          {busy && <Spinner className="h-3.5 w-3.5" />}
          {t('trading.placeOrder', { side: t(form.side === 'buy' ? 'trading.buy' : 'trading.sell') })}
        </button>
        {error && <ErrorBox error={error} title={t('trading.orderRejected')} />}
        {result && <div className="rounded-lg border border-up/40 bg-up/10 p-3 text-sm text-up">{t('trading.orderFilled', { id: result.id, price: fmtPrice(result.price), fee: fmtPrice(result.fee) })}</div>}
      </form>
    </Card>
  );
}

function RiskCalculator({ stocks }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ symbol: 'VIC', quantity: 100, entryPrice: '', stopLoss: '', takeProfit: '' });
  const [state, setState] = useState({ loading: false, data: null, error: null });

  const run = async (event) => {
    event.preventDefault();
    setState({ loading: true, data: null, error: null });
    try {
      const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, key === 'symbol' ? value : value === '' ? undefined : Number(value)]));
      setState({ loading: false, data: await api.risk(body), error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  };
  const result = state.data;

  return (
    <Card>
      <CardHeader title={t('trading.riskTitle')} subtitle={t('trading.riskSubtitle')} />
      <form className="grid grid-cols-2 gap-3 p-4" onSubmit={run}>
        <Field label={t('common.stock')}>
          <select className="input" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })}>
            {(stocks || [{ symbol: 'VIC' }]).map((stock) => (
              <option key={stock.symbol}>{stock.symbol}</option>
            ))}
          </select>
        </Field>
        <Field label={t('common.quantity')}>
          <input className="input" type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
        </Field>
        <Field label={t('trading.entryPriceOptional')}>
          <input className="input" type="number" min="1" value={form.entryPrice} onChange={(event) => setForm({ ...form, entryPrice: event.target.value })} />
        </Field>
        <Field label={t('trading.stopLoss')}>
          <input className="input" type="number" min="1" value={form.stopLoss} onChange={(event) => setForm({ ...form, stopLoss: event.target.value })} />
        </Field>
        <Field label={t('trading.takeProfit')}>
          <input className="input" type="number" min="1" value={form.takeProfit} onChange={(event) => setForm({ ...form, takeProfit: event.target.value })} />
        </Field>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={state.loading}>
            {state.loading && <Spinner className="h-3.5 w-3.5" />}
            {t('trading.estimateRisk')}
          </button>
        </div>
      </form>
      {state.error && <ErrorBox error={state.error} />}
      {result && (
        <div className="border-t border-line/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            {t('trading.riskLevel')}
            <span className={`chip ${result.riskLevel === 'low' ? 'bg-up/15 text-up' : result.riskLevel === 'high' ? 'bg-down/15 text-down' : 'bg-raised text-muted'}`}>
              {t(result.riskLevel === 'low' ? 'trading.riskLow' : result.riskLevel === 'high' ? 'trading.riskHigh' : 'trading.riskMedium')}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              // fmtPercentValue keeps the locale decimal separator, and no plus sign: these
              // are magnitudes, not signed moves.
              [t('trading.positionValue'), fmtMoney(result.positionValue)],
              [t('trading.annualizedVolatility'), fmtPercentValue(result.annualizedVolatilityPercent)],
              [t('trading.varHistorical'), fmtMoney(result.oneDayVaR95Historical)],
              [t('trading.varParametric'), fmtMoney(result.oneDayVaR95Parametric)],
              [t('trading.maxDrawdown'), fmtPercentValue(result.maxDrawdown1YPercent)],
              [t('trading.riskRewardRatio'), result.riskRewardRatio != null ? fmtPrice(result.riskRewardRatio, 2) : '-'],
              [t('trading.plAtStop'), result.stopLossPnl != null ? fmtMoney(result.stopLossPnl) : '-'],
              [t('trading.plAtTakeProfit'), result.takeProfitPnl != null ? fmtMoney(result.takeProfitPnl) : '-']
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="min-w-0 break-words text-muted">{label}</dt>
                <dd className="min-w-0 break-words text-right font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">{result.method}</p>
        </div>
      )}
    </Card>
  );
}

function PnlCalculator() {
  const { t } = useI18n();
  const [form, setForm] = useState({ entryPrice: 100000, exitPrice: 105000, quantity: 100, feePercent: 0.15 });
  const [state, setState] = useState({ data: null, error: null });

  const run = async (event) => {
    event.preventDefault();
    try {
      setState({ data: await api.pnl(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)]))), error: null });
    } catch (error) {
      setState({ data: null, error });
    }
  };
  const result = state.data;

  return (
    <Card>
      <CardHeader title={t('trading.pnlTitle')} subtitle={t('trading.pnlSubtitle')} />
      <form className="grid grid-cols-2 gap-3 p-4" onSubmit={run}>
        {[
          ['entryPrice', t('trading.entryPrice')],
          ['exitPrice', t('trading.exitPrice')],
          ['quantity', t('common.quantity')],
          ['feePercent', t('trading.feePercent')]
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input className="input" type="number" step="any" min="0" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required />
          </Field>
        ))}
        <button className="btn btn-primary col-span-2">{t('trading.calculate')}</button>
      </form>
      {state.error && <ErrorBox error={state.error} />}
      {result && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/70 p-4 text-sm">
          <dt className="min-w-0 break-words text-muted">{t('trading.grossPnl')}</dt>
          <dd className={`min-w-0 break-words text-right font-medium tabular-nums ${trendClass(result.grossPnl)}`}>{fmtMoney(result.grossPnl)}</dd>
          <dt className="min-w-0 break-words text-muted">{t('trading.fees')}</dt>
          <dd className="min-w-0 break-words text-right font-medium tabular-nums">{fmtMoney(result.fees)}</dd>
          <dt className="min-w-0 break-words text-muted">{t('trading.netPnl')}</dt>
          <dd className={`min-w-0 break-words text-right font-semibold tabular-nums ${trendClass(result.netPnl)}`}>{fmtMoney(result.netPnl)}</dd>
          <dt className="min-w-0 break-words text-muted">{t('trading.netReturn')}</dt>
          <dd className={`min-w-0 break-words text-right font-semibold tabular-nums ${trendClass(result.netPnl)}`}>{fmtPct(result.returnPercent)}</dd>
        </dl>
      )}
    </Card>
  );
}

export default function Trading() {
  const { t } = useI18n();
  const stocks = useApi(() => api.searchStocks(''), []);
  const account = useApi(api.portfolio, []);
  const orders = useApi(api.orders, []);

  const refresh = () => {
    account.reload();
    orders.reload();
  };

  const reset = async () => {
    if (!window.confirm(t('trading.resetConfirm'))) return;
    await api.resetAccount();
    refresh();
  };

  const data = account.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('trading.title')}</h1>
          <p className="text-sm text-muted">{t('trading.subtitle')}</p>
        </div>
        <button className="btn" onClick={reset}>
          <RotateCcw size={14} />
          {t('trading.reset')}
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [t('trading.virtualCash'), fmtMoney(data.cash), ''],
            [t('trading.holdingsValue'), fmtMoney(data.holdingsValue), ''],
            [t('trading.totalEquity'), fmtMoney(data.totalEquity), ''],
            [t('trading.realizedPnl'), fmtMoney(data.realizedPnl), trendClass(data.realizedPnl)]
          ].map(([label, value, tone]) => (
            <Card key={label} className="overflow-hidden px-4 py-3" hover>
              <Stat label={label} value={value} tone={tone} />
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <OrderForm stocks={stocks.data} onDone={refresh} />
        <RiskCalculator stocks={stocks.data} />
        <PnlCalculator />
      </div>

      <Card>
        <CardHeader title={t('trading.orderHistory')} subtitle={t('trading.orderHistorySubtitle', { fee: data ? (data.feeRate * 100).toFixed(2) : '0.15' })} />
        {orders.loading && !orders.data && <LoadingBlock height="h-20" />}
        {orders.error && <ErrorBox error={orders.error} onRetry={orders.reload} />}
        {orders.data?.length === 0 && <Empty>{t('trading.ordersEmpty')}</Empty>}
        {orders.data?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-line/70">
                  {[t('trading.time'), t('common.symbol'), t('trading.side'), t('common.quantity'), t('common.price'), t('trading.fee'), t('portfolio.pl')].map((header, i) => (
                    <th key={header} className={`th ${i > 2 ? 'text-right' : ''}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.data.map((order) => (
                  <tr key={order.id} className="border-b border-line/40 transition-colors last:border-0 hover:bg-raised/70">
                    <td className="td text-muted">{new Date(order.createdAt).toLocaleTimeString(getFormatLocale())}</td>
                    <td className="td font-semibold">{order.symbol}</td>
                    <td className={`td font-medium ${order.side === 'buy' ? 'text-up' : 'text-down'}`}>{t(order.side === 'buy' ? 'trading.buy' : 'trading.sell')}</td>
                    <td className="td text-right">{fmtPrice(order.quantity)}</td>
                    <td className="td text-right">{fmtPrice(order.price)}</td>
                    <td className="td text-right">{fmtPrice(order.fee)}</td>
                    <td className={`td text-right ${trendClass(order.realizedPnl)}`}>{order.realizedPnl != null ? fmtPrice(order.realizedPnl) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
