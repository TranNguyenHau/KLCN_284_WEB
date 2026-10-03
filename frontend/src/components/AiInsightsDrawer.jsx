import { BrainCircuit, ChevronLeft, ChevronRight, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';
import { buildInsights } from '../utils/insights.js';
import { SkeletonLines } from './Skeleton.jsx';

const SIGNAL_TONE = { bullish: 'bg-up/15 text-up', bearish: 'bg-down/15 text-down', neutral: 'bg-raised text-muted' };
const SIGNAL_ICON = { bullish: TrendingUp, bearish: TrendingDown, neutral: Minus };
const SIGNAL_KEY = { bullish: 'insights.bullish', bearish: 'insights.bearish', neutral: 'insights.neutral' };

function Gauge({ value, tone }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgb(var(--line))" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={`rgb(var(--${tone}))`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold">{value}%</span>
    </div>
  );
}

export default function AiInsightsDrawer({ open, onToggle, state, symbol, trend }) {
  const { t } = useI18n();
  const insights = buildInsights(state?.data);
  const tone = !insights ? 'muted' : insights.bias === 'bullish' ? 'up' : insights.bias === 'bearish' ? 'down' : 'muted';

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="glass flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-medium text-accent transition-colors hover:bg-raised xl:h-full xl:w-full xl:flex-col xl:py-4"
        aria-label={t('insights.open')}
        title={t('insights.open')}
      >
        <Sparkles size={15} />
        <span className="xl:[writing-mode:vertical-rl]">{t('insights.title')}</span>
      </button>
    );
  }

  return (
    <section className="glass flex flex-col rounded-xl">
      <header className="flex items-start justify-between gap-3 border-b border-line/60 px-4 py-3">
        <div className="flex items-start gap-2">
          <BrainCircuit size={16} className="mt-0.5 text-accent" />
          <div>
            <h2 className="text-sm font-semibold">{t('insights.title')}</h2>
            <p className="mt-0.5 text-xs text-muted">{t('insights.subtitle')}</p>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon px-1.5 py-1.5" onClick={onToggle} aria-label={t('insights.close')} title={t('insights.close')}>
          <ChevronRight size={14} className="hidden xl:block" />
          <ChevronLeft size={14} className="xl:hidden" />
        </button>
      </header>

      {state?.loading && !state?.data && (
        <div className="p-4">
          <SkeletonLines lines={5} />
        </div>
      )}

      {state?.error && <p className="px-4 py-4 text-xs text-muted">{t('insights.failed', { message: state.error.message })}</p>}

      {insights && (
        <div className="flex-1 space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Gauge value={insights.agreement} tone={tone} />
            <div className="min-w-0">
              <p className="text-xs text-muted">{t('insights.confidence')}</p>
              <p className="text-sm font-semibold">{t(insights.verdictKey)}</p>
              <p className="mt-0.5 text-xs text-muted">
                {insights.bullish} ↑ · {insights.bearish} ↓ · {insights.neutral} →
              </p>
            </div>
          </div>

          {(trend || insights.bias) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-line/70 bg-surface/50 px-3 py-2">
                <p className="text-muted">{t('insights.modelTrend')}</p>
                <p className={`mt-0.5 font-semibold ${trend?.direction === 'up' ? 'text-up' : trend?.direction === 'down' ? 'text-down' : 'text-muted'}`}>
                  {trend ? t(`insights.${trend.direction}`) : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-line/70 bg-surface/50 px-3 py-2">
                <p className="text-muted">{t('insights.technicalBias')}</p>
                <p className={`mt-0.5 font-semibold ${insights.bias === 'bullish' ? 'text-up' : insights.bias === 'bearish' ? 'text-down' : 'text-muted'}`}>{t(SIGNAL_KEY[insights.bias])}</p>
              </div>
            </div>
          )}

          {trend && insights.bias !== 'neutral' && (
            <p className={`rounded-lg border px-3 py-2 text-xs ${(trend.direction === 'up') === (insights.bias === 'bullish') ? 'border-up/35 bg-up/10 text-up' : 'border-warn/35 bg-warn/10 text-warn'}`}>
              {(trend.direction === 'up') === (insights.bias === 'bullish') ? t('insights.aligned') : t('insights.divergence')}
            </p>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('insights.factors')}</p>
            <ul className="space-y-2">
              {insights.factors.map((factor) => {
                const Icon = SIGNAL_ICON[factor.signal];
                return (
                  <li key={factor.key} className="rounded-lg border border-line/70 bg-surface/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{t(factor.titleKey)}</span>
                      <span className={`chip gap-1 ${SIGNAL_TONE[factor.signal]}`}>
                        <Icon size={11} />
                        {t(SIGNAL_KEY[factor.signal])}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(factor.textKey, factor.vars)}</p>
                  </li>
                );
              })}
            </ul>
          </div>

          {state?.data?.bias && (
            <p className="border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">{t('insights.disclaimer')}</p>
          )}
        </div>
      )}

      {!state?.data && !state?.loading && !state?.error && <p className="px-4 py-4 text-xs text-muted">{t('insights.waiting', { symbol })}</p>}
    </section>
  );
}
