import { useI18n } from '../i18n/index.jsx';
import { fmtPrice } from '../utils/format.js';

const styles = {
  positive: 'bg-up/15 text-up',
  bullish: 'bg-up/15 text-up',
  negative: 'bg-down/15 text-down',
  bearish: 'bg-down/15 text-down',
  neutral: 'bg-raised text-muted'
};

// The API sends English labels; these map the known ones onto the active language.
const LABEL_KEYS = {
  positive: 'news.positive',
  negative: 'news.negative',
  neutral: 'news.neutral',
  bullish: 'insights.bullish',
  bearish: 'insights.bearish'
};

export default function SentimentBadge({ label, score }) {
  const { t } = useI18n();
  const key = String(label ?? '').toLowerCase();
  const text = key === 'neutral' ? t('insights.neutral') : LABEL_KEYS[key] ? t(LABEL_KEYS[key]) : label;

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium capitalize ${styles[key] || styles.neutral}`}>
      {text}
      {score != null && (
        <span className="opacity-80">
          {score > 0 ? '+' : ''}
          {fmtPrice(score, 2)}
        </span>
      )}
    </span>
  );
}
