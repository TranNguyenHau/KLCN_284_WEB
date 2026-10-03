// Locale-aware number formatting. The active locale is set by I18nProvider so every
// call site picks up the selected language without taking an extra argument.
let LOCALE = 'en-US';

export const setFormatLocale = (locale) => {
  LOCALE = locale || 'en-US';
};

export const getFormatLocale = () => LOCALE;

export const fmtPrice = (v, digits = 0) =>
  v == null || Number.isNaN(v) ? '-' : Number(v).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtCompact = (v) => (v == null ? '-' : new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(v));

export const fmtMoney = (v) => (v == null ? '-' : `${fmtPrice(v)} VND`);

export const fmtSigned = (v, digits = 0) => (v == null ? '-' : `${v > 0 ? '+' : ''}${fmtPrice(v, digits)}`);

// Percentages follow the active locale too: toFixed() would render "-0.92%" next to the
// Vietnamese "-11,95" in the same chip, mixing the two decimal separators.
export const fmtPct = (v, digits = 2) =>
  v == null || Number.isNaN(v) ? '-' : `${v > 0 ? '+' : ''}${Number(v).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const trendClass = (v) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted');

export const shortDate = (d) => (d ? String(d).slice(5) : '');

export const fmtDateTime = (d) => (d == null ? '-' : new Date(d).toLocaleString(LOCALE));

/** Percentages that are not a signed move (volatility, drawdown): no leading plus. */
export const fmtPercentValue = (v, digits = 2) => (v == null || Number.isNaN(v) ? '-' : `${fmtPrice(v, digits)}%`);

/**
 * Relative time. Pass the i18n `t` function to get localised wording; the English
 * fallback keeps this usable outside React.
 */
export const timeAgo = (iso, t) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const say = (key, count, fallback) => (t ? t(key, { count }) : fallback);
  if (mins < 60) return say('time.minutes', mins, `${mins} min ago`);
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? say('time.hours', hrs, `${hrs} h ago`) : say('time.days', Math.round(hrs / 24), `${Math.round(hrs / 24)} d ago`);
};
