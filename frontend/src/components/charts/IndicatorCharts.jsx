import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartColors } from '../../hooks/useChartColors.js';
import { useI18n } from '../../i18n/index.jsx';
import { fmtCompact, shortDate } from '../../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';

function Frame({ data, height, yDomain = ['auto', 'auto'], yFormatter = fmtCompact, digits = 0, children }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} strokeDasharray="2 6" />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: c.axis, fontSize: 11 }} minTickGap={36} stroke={c.grid} />
        <YAxis domain={yDomain} tickFormatter={yFormatter} tick={{ fill: c.axis, fontSize: 11 }} width={52} stroke={c.grid} />
        <Tooltip content={<ChartTooltip digits={digits} />} />
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MovingAverageChart({ data, height = 260 }) {
  const c = useChartColors();
  const { t } = useI18n();
  return (
    <Frame data={data} height={height}>
      <Line dataKey="close" name={t('stock.seriesClose')} stroke={c.ink} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      <Line dataKey="sma20" name={t('stock.seriesSma20')} stroke={c.ma1} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      <Line dataKey="sma50" name={t('stock.seriesSma50')} stroke={c.ma2} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      <Line dataKey="sma200" name={t('stock.seriesSma200')} stroke={c.ma3} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </Frame>
  );
}

export function BollingerChart({ data, height = 260 }) {
  const c = useChartColors();
  const { t } = useI18n();
  const rows = data.map((row) => ({ ...row, band: row.bbUpper != null ? [row.bbLower, row.bbUpper] : undefined }));
  return (
    <Frame data={rows} height={height}>
      <Area dataKey="band" name={t('analysis.bollingerBand')} stroke="none" fill={c.accent} fillOpacity={0.14} isAnimationActive={false} />
      <Line dataKey="bbMiddle" name={t('analysis.middleBand')} stroke={c.ma1} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      <Line dataKey="close" name={t('stock.seriesClose')} stroke={c.ink} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </Frame>
  );
}

export function RsiChart({ data, height = 200 }) {
  const c = useChartColors();
  const { t } = useI18n();
  return (
    <Frame data={data} height={height} yDomain={[0, 100]} yFormatter={(value) => value} digits={1}>
      <ReferenceLine y={70} stroke={c.down} strokeDasharray="4 3" />
      <ReferenceLine y={30} stroke={c.up} strokeDasharray="4 3" />
      <Line dataKey="rsi" name={t('analysis.rsi')} stroke={c.forecast} strokeWidth={1.75} dot={false} isAnimationActive={false} />
    </Frame>
  );
}

export function MacdChart({ data, height = 220 }) {
  const c = useChartColors();
  const { t } = useI18n();
  return (
    <Frame data={data} height={height} yFormatter={fmtCompact} digits={1}>
      <ReferenceLine y={0} stroke={c.axis} />
      <Bar dataKey="macdHistogram" name={t('analysis.histogram')} isAnimationActive={false}>
        {data.map((row, i) => (
          <Cell key={i} fill={(row.macdHistogram ?? 0) >= 0 ? c.up : c.down} fillOpacity={0.6} />
        ))}
      </Bar>
      <Line dataKey="macd" name={t('analysis.macd')} stroke={c.accent} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      <Line dataKey="macdSignal" name={t('analysis.signalLine')} stroke={c.ma1} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </Frame>
  );
}

export function VolumeChart({ data, height = 200 }) {
  const c = useChartColors();
  const { t } = useI18n();
  return (
    <Frame data={data} height={height}>
      <Bar dataKey="volume" name={t('analysis.volume')} isAnimationActive={false}>
        {data.map((row, i) => (
          <Cell key={i} fill={row.close >= row.open ? c.up : c.down} fillOpacity={0.55} />
        ))}
      </Bar>
      <Line dataKey="volumeSma20" name={t('analysis.volumeSma20')} stroke={c.ma1} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </Frame>
  );
}
