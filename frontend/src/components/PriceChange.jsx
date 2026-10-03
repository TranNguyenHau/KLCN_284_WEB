import { TrendingDown, TrendingUp } from 'lucide-react';
import { fmtPct, fmtSigned, trendClass } from '../utils/format.js';

export default function PriceChange({ change, percent, showIcon = true, digits = 0, className = '' }) {
  const Icon = change < 0 ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-medium ${trendClass(change ?? percent)} ${className}`}>
      {showIcon && change !== 0 && <Icon size={14} />}
      {change != null && <span>{fmtSigned(change, digits)}</span>}
      {percent != null && <span>{change != null ? `(${fmtPct(percent)})` : fmtPct(percent)}</span>}
    </span>
  );
}
