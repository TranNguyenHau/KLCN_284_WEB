import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartColors } from '../../hooks/useChartColors.js';
import { useI18n } from '../../i18n/index.jsx';
import { fmtCompact, fmtPrice, shortDate } from '../../utils/format.js';

/**
 * One candlestick: a thin wick from low to high and a solid body from open to close,
 * green when the session closed up and red when it closed down (the terminal convention
 * traders scan for first).
 *
 * Recharts hands the shape the pixel geometry of the `hl` ([low, high]) range, so the
 * price -> pixel mapping is derived from that bar instead of a second scale that could
 * drift out of step with the axis.
 */
function Candle({ x, y, width, height, payload, up, down }) {
  const { open, close, high, low } = payload;
  const color = close >= open ? up : down;
  const top = Math.min(y, y + height);
  const span = Math.abs(height);
  const ratio = high === low ? 0 : span / (high - low);
  const yOf = (value) => top + (high - value) * ratio;
  const bodyTop = yOf(Math.max(open, close));
  const bodyBottom = yOf(Math.min(open, close));
  const cx = x + width / 2;
  const bodyWidth = Math.max(1, width * 0.72);

  return (
    <g>
      <line x1={cx} x2={cx} y1={yOf(high)} y2={yOf(low)} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={Math.max(1, bodyBottom - bodyTop)} fill={color} />
    </g>
  );
}

function CandleTooltip({ active, payload, colors }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = [
    [t('stock.open'), d.open],
    [t('stock.high'), d.high],
    [t('stock.low'), d.low],
    [t('common.closePrice'), d.close]
  ];
  const up = d.close >= d.open;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur-md" style={{ background: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.ink }}>
      <div className="mb-1 flex items-center justify-between gap-3 font-semibold">
        <span>{d.date}</span>
        <span style={{ color: up ? colors.up : colors.down }}>{fmtPrice(d.close)}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span>{k}</span>
          <span className="font-medium">{fmtPrice(v)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Dense candlestick chart. It is deliberately busy: a lot of sessions on screen, faint
 * grid, dashed guides at the visible high/low and a dashed "now" line on the latest
 * session - the layout a trader reads at a glance.
 */
export default function CandleChart({ history = [], height = 380, limit = 260 }) {
  const c = useChartColors();
  const data = history.slice(-limit).map((row) => ({ ...row, hl: [row.low, row.high] }));
  if (!data.length) return null;

  const min = Math.min(...data.map((d) => d.low));
  const max = Math.max(...data.map((d) => d.high));
  const pad = (max - min) * 0.06 || Math.max(1, max * 0.01);
  const last = data.at(-1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} strokeOpacity={0.45} strokeDasharray="2 5" />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: c.axis, fontSize: 11 }} minTickGap={44} stroke={c.grid} />
        <YAxis domain={[min - pad, max + pad]} tickFormatter={fmtCompact} tick={{ fill: c.axis, fontSize: 11 }} width={52} stroke={c.grid} allowDataOverflow tickCount={6} />
        <Tooltip content={<CandleTooltip colors={c} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3', strokeOpacity: 0.6 }} />

        {/* Visible window guides: highest and lowest session, plus the live edge. */}
        <ReferenceLine y={max} stroke={c.axis} strokeOpacity={0.45} strokeDasharray="4 4" />
        <ReferenceLine y={min} stroke={c.axis} strokeOpacity={0.45} strokeDasharray="4 4" />
        {last && <ReferenceLine x={last.date} stroke={c.axis} strokeOpacity={0.6} strokeDasharray="4 4" />}

        {/* maxBarSize keeps the candles thin even on a short range, where Recharts would
            otherwise stretch a handful of bars across the whole plot. */}
        <Bar dataKey="hl" shape={(props) => <Candle {...props} up={c.up} down={c.down} />} isAnimationActive={false} maxBarSize={14} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
