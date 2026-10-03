export function Card({ className = '', children, glass = false, hover = false }) {
  return <section className={`${glass ? 'glass' : 'card'} rounded-xl ${hover ? 'card-hover' : ''} ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, right, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-accent" />}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export default Card;
