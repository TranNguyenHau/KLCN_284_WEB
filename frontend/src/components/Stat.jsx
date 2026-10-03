/**
 * One number in a stat grid.
 *
 * The values here are long ("500.000.000 VND" in Vietnamese, "4,2 Tr" for volume) and a
 * grid or flex item refuses to shrink below its content width by default, which is what
 * pushed the text out of the card. So: `min-w-0` lets the cell shrink, `break-words`
 * wraps a long amount, and the label wraps instead of being clipped.
 */
export default function Stat({ label, value, sub, tone = '', icon: Icon, className = '', valueClassName = '' }) {
  const title = typeof value === 'string' && value.length > 10 ? value : undefined;

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        {Icon && <Icon size={12} className="shrink-0 text-muted" aria-hidden="true" />}
        <p className="stat-label">{label}</p>
      </div>
      <p className={`stat-value sm:text-lg ${tone} ${valueClassName}`} title={title}>
        {value}
      </p>
      {sub && <p className={`mt-0.5 text-xs leading-snug ${tone || 'text-muted'}`}>{sub}</p>}
    </div>
  );
}
