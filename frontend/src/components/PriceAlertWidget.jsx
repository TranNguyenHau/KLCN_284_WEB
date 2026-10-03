import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardHeader } from './Card.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../hooks/useToast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { fmtPrice } from '../utils/format.js';

const POLL_MS = 25000;

export default function PriceAlertWidget({ symbol, price }) {
  const { t } = useI18n();
  const { push } = useToast();
  const alerts = useApi(api.alerts, []);
  const [condition, setCondition] = useState('above');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(price ?? null);
  const notified = useRef(new Set());

  useEffect(() => {
    if (price != null) setLive(price);
  }, [price]);

  // Poll the quote so an alert can fire while the page stays open. Polling pauses on a
  // hidden tab and refreshes immediately when the user comes back to the window.
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (document.hidden) return;
      api
        .stock(symbol)
        .then((quote) => alive && setLive(quote.price))
        .catch(() => {});
    };
    const id = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [symbol]);

  const mine = useMemo(() => (alerts.data || []).filter((alert) => alert.symbol === symbol), [alerts.data, symbol]);

  useEffect(() => {
    if (live == null) return;
    mine.forEach((alert) => {
      const hit = alert.condition === 'above' ? live >= alert.price : live <= alert.price;
      if (!hit || notified.current.has(alert.id)) return;
      notified.current.add(alert.id);
      push({
        tone: 'warn',
        title: t('alerts.toastTitle'),
        description: t(alert.condition === 'above' ? 'alerts.toastAbove' : 'alerts.toastBelow', { symbol: alert.symbol, price: fmtPrice(alert.price) }),
        duration: 12000
      });
    });
  }, [live, mine, push, t]);

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(target);
    if (!(value > 0)) {
      setError(t('alerts.invalidPrice'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addAlert({ symbol, condition, price: value });
      setTarget('');
      alerts.reload();
      push({ tone: 'success', title: t('alerts.created', { symbol, price: fmtPrice(value) }) });
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    notified.current.delete(id);
    await api.removeAlert(id);
    alerts.reload();
  };

  return (
    <Card>
      <CardHeader
        title={t('alerts.widgetTitle')}
        subtitle={t('alerts.widgetSubtitle')}
        right={
          <span className="chip bg-raised text-muted">
            <BellRing size={12} />
            {live != null ? fmtPrice(live) : '—'}
          </span>
        }
      />

      <form className="space-y-3 border-b border-line/70 p-4" onSubmit={submit}>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={t('common.condition')}>
            {['above', 'below'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCondition(option)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${condition === option ? (option === 'above' ? 'bg-up/20 text-up' : 'bg-down/20 text-down') : 'text-muted hover:text-ink'}`}
                aria-pressed={condition === option}
              >
                {option === 'above' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {t(option === 'above' ? 'alerts.conditionAbove' : 'alerts.conditionBelow')}
              </button>
            ))}
          </div>
          <input
            className="input"
            type="number"
            min="1"
            step="any"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={t('alerts.targetPrice')}
            aria-label={t('alerts.targetPrice')}
          />
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>
          <Plus size={14} />
          {t('alerts.create')}
        </button>
        {error && <p className="text-xs text-down">{error}</p>}
      </form>

      {alerts.loading && !alerts.data && <p className="px-4 py-4 text-xs text-muted">{t('common.loading')}…</p>}
      {mine.length === 0 && !alerts.loading && <p className="px-4 py-4 text-xs text-muted">{t('alerts.empty')}</p>}

      <ul className="divide-y divide-line/60">
        {mine.map((alert) => {
          const hit = alert.condition === 'above' ? (live ?? alert.currentPrice) >= alert.price : (live ?? alert.currentPrice) <= alert.price;
          return (
            <li key={alert.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {t(alert.condition === 'above' ? 'alerts.conditionAbove' : 'alerts.conditionBelow')} {fmtPrice(alert.price)}
                </p>
                <p className="text-xs text-muted">{t('alerts.current', { price: fmtPrice(live ?? alert.currentPrice) })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`chip ${hit ? 'bg-warn/15 text-warn' : 'bg-raised text-muted'}`}>{t(hit ? 'alerts.triggered' : 'alerts.waiting')}</span>
                <button type="button" className="text-muted transition-colors hover:text-down" onClick={() => remove(alert.id)} aria-label={t('alerts.remove')} title={t('alerts.remove')}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
