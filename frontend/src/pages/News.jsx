import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '../components/Card.jsx';
import { Empty, ErrorBox, LoadingBlock } from '../components/StatusViews.jsx';
import SentimentBadge from '../components/SentimentBadge.jsx';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../services/api.js';
import { timeAgo } from '../utils/format.js';

export default function News() {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState('');
  const [sentiment, setSentiment] = useState('');
  const stocks = useApi(() => api.searchStocks(''), []);
  const { data, loading, error, reload } = useApi(() => api.news({ symbol: symbol || undefined, sentiment: sentiment || undefined }), [symbol, sentiment]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('news.title')}</h1>
          <p className="text-sm text-muted">{t('news.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-40" value={symbol} onChange={(event) => setSymbol(event.target.value)} aria-label={t('news.filterStock')}>
            <option value="">{t('news.allStocks')}</option>
            {(stocks.data || []).map((stock) => (
              <option key={stock.symbol}>{stock.symbol}</option>
            ))}
          </select>
          <select className="input w-40" value={sentiment} onChange={(event) => setSentiment(event.target.value)} aria-label={t('news.filterSentiment')}>
            <option value="">{t('news.anySentiment')}</option>
            <option value="positive">{t('news.positive')}</option>
            <option value="neutral">{t('news.neutral')}</option>
            <option value="negative">{t('news.negative')}</option>
          </select>
        </div>
      </div>

      {loading && !data && <LoadingBlock label={t('status.loadingNews')} height="h-48" />}
      {error && (
        <Card>
          <ErrorBox error={error} onRetry={reload} />
        </Card>
      )}

      {data && (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardHeader title={t('news.articles', { count: data.articles.length })} />
            {data.articles.length === 0 && <Empty>{t('news.empty')}</Empty>}
            <ul className="divide-y divide-line/60">
              {data.articles.map((article) => (
                <li key={article.id} className="px-4 py-4 transition-colors hover:bg-raised/40">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">{article.title}</h3>
                    <SentimentBadge label={article.sentiment.label} score={article.sentiment.score} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{article.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{article.source}</span>
                    <span>{timeAgo(article.publishedAt, t)}</span>
                    {article.symbols.map((item) => (
                      <Link key={item} to={`/stock/${item}`} className="rounded bg-raised px-1.5 py-0.5 font-medium text-ink transition-colors hover:text-accent">
                        {item}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="h-fit">
            <CardHeader title={t('news.summary')} subtitle={symbol || t('news.allStocks')} right={<SentimentBadge label={data.summary.label} score={data.summary.averageScore} />} />
            <div className="grid grid-cols-3 gap-2 p-4 text-center">
              <div className="min-w-0">
                <div className="text-xl font-semibold tabular-nums text-up">{data.summary.positive}</div>
                <div className="break-words text-xs leading-snug text-muted">{t('news.positive')}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold tabular-nums text-muted">{data.summary.neutral}</div>
                <div className="break-words text-xs leading-snug text-muted">{t('news.neutral')}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold tabular-nums text-down">{data.summary.negative}</div>
                <div className="break-words text-xs leading-snug text-muted">{t('news.negative')}</div>
              </div>
            </div>
            <p className="border-t border-line/70 px-4 py-3 text-xs text-muted">{t('news.method')}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
