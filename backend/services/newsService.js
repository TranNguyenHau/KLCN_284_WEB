import { round } from '../utils/errors.js';

const POSITIVE = new Set(['growth', 'surge', 'surges', 'beat', 'beats', 'record', 'profit', 'profits', 'upgrade', 'upgrades', 'strong', 'rise', 'rises', 'gain', 'gains', 'expands', 'expansion', 'approval', 'recovery', 'optimistic', 'dividend', 'higher', 'improves', 'boost']);
const NEGATIVE = new Set(['decline', 'declines', 'drop', 'drops', 'loss', 'losses', 'downgrade', 'downgrades', 'weak', 'fall', 'falls', 'lawsuit', 'risk', 'risks', 'delay', 'delays', 'debt', 'cut', 'cuts', 'slump', 'investigation', 'lower', 'concern', 'concerns', 'pressure']);

export function scoreSentiment(text) {
  const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) pos++;
    else if (NEGATIVE.has(w)) neg++;
  }
  const score = pos + neg === 0 ? 0 : (pos - neg) / (pos + neg);
  const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
  return { score: round(score, 2), label, positiveHits: pos, negativeHits: neg };
}

const TEMPLATES = [
  { symbols: ['VIC', 'VHM'], hoursAgo: 3, title: 'Property developers report strong pre-sales growth', summary: 'Sample item: residential pre-sales rise as project launches resume.' },
  { symbols: ['VIC'], hoursAgo: 9, title: 'Conglomerate faces higher debt pressure from new project financing', summary: 'Sample item: analysts flag debt concerns tied to expansion plans.' },
  { symbols: ['VCB', 'TCB', 'VPB'], hoursAgo: 5, title: 'Banking sector profit gains as credit growth improves', summary: 'Sample item: lenders post higher net interest income for the quarter.' },
  { symbols: ['TCB', 'VPB'], hoursAgo: 20, title: 'Regulator signals new cap that may cut lending margins', summary: 'Sample item: proposed rule raises concern among mid-size lenders.' },
  { symbols: ['HPG'], hoursAgo: 12, title: 'Steel demand recovery lifts outlook for producers', summary: 'Sample item: construction activity shows a recovery in domestic demand.' },
  { symbols: ['HPG'], hoursAgo: 30, title: 'Raw material costs weigh on steel margins', summary: 'Sample item: input prices move higher and add pressure to margins.' },
  { symbols: ['FPT'], hoursAgo: 7, title: 'Technology group reports record overseas software contracts', summary: 'Sample item: export services drive strong revenue growth.' },
  { symbols: ['MWG'], hoursAgo: 26, title: 'Retail chain sees weak consumer spending in electronics', summary: 'Sample item: same-store sales decline as demand stays soft.' },
  { symbols: ['VNM', 'MSN'], hoursAgo: 15, title: 'Consumer staples steady as input costs stabilize', summary: 'Sample item: producers hold prices while volumes remain flat.' },
  { symbols: ['GAS'], hoursAgo: 40, title: 'Gas distributor announces higher dividend payout', summary: 'Sample item: board approves a higher cash dividend for shareholders.' },
  { symbols: ['SSI'], hoursAgo: 4, title: 'Brokerages gain as trading volumes surge', summary: 'Sample item: retail participation lifts commission income.' },
  { symbols: [], hoursAgo: 2, title: 'Market outlook: analysts optimistic on second-half earnings growth', summary: 'Sample item: strategists expect stronger corporate profit.' },
  { symbols: [], hoursAgo: 18, title: 'Global uncertainty raises risk for emerging market equities', summary: 'Sample item: foreign investors show concern over currency swings.' },
  { symbols: ['VHM'], hoursAgo: 34, title: 'Regulatory review causes project delay for developers', summary: 'Sample item: approval timelines lengthen for large projects.' }
];

function buildArticles() {
  const now = Date.now();
  return TEMPLATES.map((t, i) => {
    const sentiment = scoreSentiment(`${t.title}. ${t.summary}`);
    return {
      id: `sample-${i + 1}`,
      title: t.title,
      summary: t.summary,
      source: 'Sample feed',
      symbols: t.symbols,
      publishedAt: new Date(now - t.hoursAgo * 3600 * 1000).toISOString(),
      sentiment,
      isSample: true
    };
  }).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

export async function getNews({ symbol, sentiment } = {}) {
  let articles = buildArticles();
  if (symbol) articles = articles.filter((a) => a.symbols.includes(symbol) || a.symbols.length === 0);
  if (sentiment) articles = articles.filter((a) => a.sentiment.label === sentiment);
  return articles;
}

export async function getNewsSentiment(symbol) {
  const articles = await getNews({ symbol });
  const scores = articles.map((a) => a.sentiment.score);
  const averageScore = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
  const count = (l) => articles.filter((a) => a.sentiment.label === l).length;
  return {
    symbol: symbol || null,
    articleCount: articles.length,
    averageScore: round(averageScore, 2),
    label: averageScore > 0.15 ? 'positive' : averageScore < -0.15 ? 'negative' : 'neutral',
    positive: count('positive'),
    negative: count('negative'),
    neutral: count('neutral'),
    method: 'Keyword lexicon scoring on sample articles; replace with a real news feed and NLP model',
    isSample: true
  };
}
