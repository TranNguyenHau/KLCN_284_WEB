import { round } from '../../utils/errors.js';
import { localeOf, normalizeLanguage } from '../../utils/language.js';
import { MESSAGES } from './composerMessages.js';

const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (match, key) => (vars[key] == null ? match : String(vars[key])));

const money = (value, language) => `${Math.round(value).toLocaleString(localeOf(language))} VND`;

function decimal(value, language, digits = 2) {
  return Number(round(value, digits)).toLocaleString(localeOf(language), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signedPercent(value, language) {
  return `${value > 0 ? '+' : ''}${decimal(value, language)}%`;
}

const stateWord = (messages, state) => messages.states[state] || state;
const sentimentWord = (messages, label) => messages.sentiments[label] || label;
const indicatorName = (messages, name) => messages.indicators[name] || name;

/**
 * Formats the evidence gathered by the agent. Every sentence, number and label follows
 * `language` - the language the user picked in the interface - and no number is ever
 * restated that the tools did not return.
 */
export function composeReply({ symbol, evidence, failures = {}, language }) {
  const lang = normalizeLanguage(language);
  const m = MESSAGES[lang];
  const out = [];
  const q = evidence.price;
  const h = evidence.history;
  const p = evidence.prediction;
  const t = evidence.technical;
  const s = evidence.sentiment;

  if (q || h) {
    const lines = [];
    if (q) {
      lines.push(fill(m.quote, {
        symbol,
        price: money(q.price, lang),
        change: signedPercent(q.changePercent, lang),
        asOf: q.asOf,
        source: q.dataSource,
        realtime: q.isRealtime ? '' : m.realtimeNote
      }));
    }
    if (h) {
      lines.push(fill(m.trend, {
        d30: signedPercent(h.change30dPercent, lang),
        d90: signedPercent(h.change90dPercent, lang),
        low: money(h.low52w, lang),
        high: money(h.high52w, lang)
      }));
    }
    out.push(`**${m.marketDataTitle}**\n${lines.join(' ')}`);
  }

  if (p) {
    const first = p.predictions[0];
    const last = p.predictions.at(-1);
    out.push(`**${m.predictionTitle}**\n${fill(m.prediction, {
      first: money(first.predicted_price, lang),
      firstDate: first.date,
      last: money(last.predicted_price, lang),
      lastDate: last.date,
      days: p.days
    })}`);
  } else if (failures.prediction) {
    out.push(`**${m.predictionTitle}**\n${fill(m.predictionUnavailable, { reason: failures.prediction })}`);
  }

  if (t) {
    const items = t.signals.map((x) => {
      const vars = { name: indicatorName(m, x.indicator), state: stateWord(m, x.signal), detail: x.detail };
      return fill(x.detail ? m.technicalItem : m.technicalItemPlain, vars);
    });
    out.push(`**${m.technicalTitle}**\n${items.join('; ')}. ${fill(m.technicalSummary, { bias: stateWord(m, t.bias) })}`);
  }

  if (s) {
    out.push(`**${m.newsTitle}**\n${fill(m.news, {
      count: s.articleCount,
      score: decimal(s.averageScore, lang),
      label: sentimentWord(m, s.label),
      positive: s.positive,
      neutral: s.neutral,
      negative: s.negative
    })}`);
  }

  const view = [];
  if (p && q) {
    const move = ((p.predictions.at(-1).predicted_price - q.price) / q.price) * 100;
    const direction = move > 0.5 ? 'pointUp' : move < -0.5 ? 'pointDown' : 'pointFlat';
    view.push(fill(m[direction], { move: signedPercent(move, lang) }));
  }
  if (t) view.push(fill(m.pointIndicators, { bias: stateWord(m, t.bias) }));
  if (s) view.push(fill(m.pointNews, { label: sentimentWord(m, s.label) }));

  if (view.length) {
    const dirs = [];
    if (p && q) dirs.push(Math.sign(p.predictions.at(-1).predicted_price - q.price));
    if (t) dirs.push(t.bias === 'bullish' ? 1 : t.bias === 'bearish' ? -1 : 0);
    if (s) dirs.push(s.label === 'positive' ? 1 : s.label === 'negative' ? -1 : 0);
    const agree = dirs.length > 1 && dirs.every((d) => d === dirs[0]);
    const note = dirs.length > 1 ? (agree ? m.agree : m.mixed) : '';
    out.push(`**${m.interpretationTitle}**\n${view.join('; ')}. ${note} ${m.notAdvice}`);
  }
  return out.join('\n\n');
}

export function composeMarket(market, language) {
  const lang = normalizeLanguage(language);
  const m = MESSAGES[lang];
  const gainers = market.topGainers.map((x) => `${x.symbol} ${signedPercent(x.changePercent, lang)}`).join(', ');
  const losers = market.topLosers.map((x) => `${x.symbol} ${signedPercent(x.changePercent, lang)}`).join(', ');
  return `**${m.marketDataTitle}**\n${fill(m.market, {
    asOf: market.asOf,
    source: market.dataSource,
    advancers: market.breadth.advancers,
    decliners: market.breadth.decliners,
    unchanged: market.breadth.unchanged
  })}\n${fill(m.gainers, { list: gainers })}\n${fill(m.losers, { list: losers })}\n\n**${m.interpretationTitle}**\n${fill(m.marketSentiment, {
    // The overview labels arrive capitalised ("Bullish"), the word tables are lowercase.
    label: stateWord(m, String(market.sentiment.label).toLowerCase()),
    score: decimal(market.sentiment.score, lang)
  })}`;
}

export const helpText = (language) => MESSAGES[normalizeLanguage(language)].help;

export const fallbackNotice = (language, reason) => fill(MESSAGES[normalizeLanguage(language)].fallbackNotice, { reason });
