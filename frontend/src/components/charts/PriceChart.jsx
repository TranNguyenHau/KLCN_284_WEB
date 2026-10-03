import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartColors } from '../../hooks/useChartColors.js';
import { useI18n } from '../../i18n/index.jsx';
import { fmtCompact, shortDate } from '../../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';

export default function PriceChart({ history, predictions, height = 380 }) {
  const c = useChartColors();
  const { t } = useI18n();
  const hasBand = predictions?.some((p) => p.lower != null && p.upper != null);
  const actualLabel = t('stock.chartActual');
  const predictedLabel = t('stock.chartPredicted');
  const data = history.map((r) => ({ date: r.date, actual: r.close }));
  const lastActual = history.at(-1);

  if (predictions?.length && lastActual) {
    data[data.length - 1]._bridge = lastActual.close;
    predictions.forEach((p) => data.push({ date: p.date, predicted: p.predicted_price, _bridge: p.predicted_price, band: hasBand ? [p.lower, p.upper] : undefined }));
  }
  const lastPredDate = predictions?.at(-1)?.date;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="2 6" />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: c.axis, fontSize: 11 }} minTickGap={36} stroke={c.grid} />
        <YAxis domain={['auto', 'auto']} tickFormatter={fmtCompact} tick={{ fill: c.axis, fontSize: 11 }} width={52} stroke={c.grid} />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="top"
          height={28}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: c.ink }}>{value}</span>}
          payload={[
            { value: actualLabel, type: 'line', color: c.accent },
            ...(predictions?.length ? [{ value: predictedLabel, type: 'plainline', color: c.forecast, payload: { strokeDasharray: '5 4' } }] : [])
          ]}
        />
        {predictions?.length > 0 && lastActual && (
          <>
            <ReferenceArea x1={lastActual.date} x2={lastPredDate} fill={c.forecast} fillOpacity={0.07} />
            <ReferenceLine x={lastActual.date} stroke={c.forecast} strokeDasharray="3 3" label={{ value: t('stock.forecastStarts'), fill: c.forecast, fontSize: 11, position: 'insideTopLeft' }} />
          </>
        )}
        {hasBand && <Area dataKey="band" name={t('stock.chartBand')} stroke="none" fill={c.forecast} fillOpacity={0.15} isAnimationActive={false} />}
        <Line dataKey="actual" name={actualLabel} stroke={c.accent} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        {/* Halo underneath the forecast: a wide, faint stroke gives the curve its neon glow. */}
        {predictions?.length > 0 && (
          <Line dataKey="_bridge" stroke={c.forecast} strokeWidth={7} strokeOpacity={0.14} dot={false} legendType="none" isAnimationActive={false} connectNulls />
        )}
        <Line dataKey="_bridge" name="bridge" stroke={c.forecast} strokeWidth={2} strokeDasharray="5 4" dot={false} legendType="none" isAnimationActive={false} connectNulls className="glow-forecast" />
        <Line
          dataKey="predicted"
          name={predictedLabel}
          stroke={c.forecast}
          strokeWidth={0}
          dot={{ r: 3, fill: c.forecast, stroke: c.forecast }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
          legendType="none"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
