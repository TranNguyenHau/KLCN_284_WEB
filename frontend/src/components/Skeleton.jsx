export function Skeleton({ className = 'h-4 w-full', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonLines({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonStat({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card px-4 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-5 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 4 }) {
  return (
    <div className="p-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 border-b border-line/50 px-1 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-24' : c === columns - 1 ? 'ml-auto w-16' : 'w-20'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 'h-[380px]' }) {
  return (
    <div className={`flex ${height} flex-col justify-end gap-2 p-4`} aria-hidden="true">
      <div className="flex h-full items-end gap-1.5">
        {[38, 52, 44, 66, 58, 74, 61, 82, 70, 88, 76, 94, 84, 68].map((h, i) => (
          <Skeleton key={i} className="w-full rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
