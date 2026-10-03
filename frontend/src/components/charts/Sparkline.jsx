import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useChartColors } from '../../hooks/useChartColors.js';

export default function Sparkline({ data, positive, height = 44 }) {
  const c = useChartColors();
  const color = positive ? c.up : c.down;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area dataKey="value" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
