import { useChartColors } from '../../hooks/useChartColors.js';
import { useI18n } from '../../i18n/index.jsx';
import { fmtPrice } from '../../utils/format.js';

export default function ChartTooltip({ active, payload, label, digits = 0 }) {
  const c = useChartColors();
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && !String(p.dataKey).startsWith('_'));
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur-md" style={{ background: c.tooltipBg, borderColor: c.tooltipBorder, color: c.ink }}>
      <div className="mb-1 font-semibold">{label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
            {p.name}
          </span>
          <span className="font-medium">
            {Array.isArray(p.value)
              ? t('prediction.rangeValue', { lower: fmtPrice(p.value[0], digits), upper: fmtPrice(p.value[1], digits) })
              : fmtPrice(p.value, digits)}
          </span>
        </div>
      ))}
    </div>
  );
}
