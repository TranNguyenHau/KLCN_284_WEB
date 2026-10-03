import { round } from '../utils/errors.js';

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export function sma(values, n) {
  return values.map((_, i) => (i < n - 1 ? null : avg(values.slice(i - n + 1, i + 1))));
}

export function ema(values, n) {
  const k = 2 / (n + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (i === n - 1) prev = avg(values.slice(0, n));
    else if (prev != null) prev = values[i] * k + prev * (1 - k);
    if (prev != null) out[i] = prev;
  }
  return out;
}

export function rsi(values, n = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalN = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null));
  const firstIdx = line.findIndex((v) => v != null);
  const compact = line.slice(firstIdx);
  const sig = ema(compact, signalN);
  const signal = new Array(values.length).fill(null);
  sig.forEach((v, i) => {
    signal[firstIdx + i] = v;
  });
  const histogram = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
  return { line, signal, histogram };
}

export function bollinger(values, n = 20, mult = 2) {
  const middle = sma(values, n);
  const upper = [];
  const lower = [];
  values.forEach((_, i) => {
    if (middle[i] == null) {
      upper.push(null);
      lower.push(null);
      return;
    }
    const slice = values.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(avg(slice.map((v) => (v - middle[i]) ** 2)));
    upper.push(middle[i] + mult * sd);
    lower.push(middle[i] - mult * sd);
  });
  return { upper, middle, lower };
}

export function computeIndicators(history, range = 126) {
  const closes = history.map((r) => r.close);
  const volumes = history.map((r) => r.volume);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsi14 = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes);
  const volSma20 = sma(volumes, 20);

  const series = history.map((r, i) => ({
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    sma20: round(sma20[i]),
    sma50: round(sma50[i]),
    sma200: round(sma200[i]),
    ema12: round(ema12[i]),
    ema26: round(ema26[i]),
    rsi: round(rsi14[i]),
    macd: round(m.line[i], 3),
    macdSignal: round(m.signal[i], 3),
    macdHistogram: round(m.histogram[i], 3),
    bbUpper: round(bb.upper[i]),
    bbMiddle: round(bb.middle[i]),
    bbLower: round(bb.lower[i]),
    volumeSma20: round(volSma20[i], 0)
  }));

  const last = series.at(-1);
  const prev = series.at(-2);
  const signals = [];
  if (last.rsi != null) {
    const s = last.rsi >= 70 ? 'bearish' : last.rsi <= 30 ? 'bullish' : 'neutral';
    const detail = last.rsi >= 70 ? 'RSI is in overbought territory' : last.rsi <= 30 ? 'RSI is in oversold territory' : 'RSI is in the neutral range';
    signals.push({ indicator: 'RSI (14)', value: last.rsi, signal: s, detail });
  }
  if (last.macdHistogram != null) {
    const rising = prev?.macdHistogram != null && last.macdHistogram > prev.macdHistogram;
    signals.push({
      indicator: 'MACD (12, 26, 9)',
      value: last.macd,
      signal: last.macdHistogram > 0 ? 'bullish' : last.macdHistogram < 0 ? 'bearish' : 'neutral',
      detail: `MACD is ${last.macdHistogram > 0 ? 'above' : 'below'} its signal line and the histogram is ${rising ? 'rising' : 'falling'}`
    });
  }
  if (last.bbUpper != null) {
    const pctB = (last.close - last.bbLower) / (last.bbUpper - last.bbLower);
    const s = pctB > 1 ? 'bearish' : pctB < 0 ? 'bullish' : 'neutral';
    signals.push({
      indicator: 'Bollinger Bands (20, 2)',
      value: round(pctB, 2),
      signal: s,
      detail: pctB > 1 ? 'Price is above the upper band' : pctB < 0 ? 'Price is below the lower band' : `Price sits at ${round(pctB * 100, 0)}% of the band width`
    });
  }
  if (last.sma50 != null && last.sma20 != null) {
    const s = last.close > last.sma50 && last.sma20 > last.sma50 ? 'bullish' : last.close < last.sma50 && last.sma20 < last.sma50 ? 'bearish' : 'neutral';
    signals.push({
      indicator: 'Moving averages',
      value: last.sma50,
      signal: s,
      detail: `Price is ${last.close > last.sma50 ? 'above' : 'below'} the 50-day average and the 20-day average is ${last.sma20 > last.sma50 ? 'above' : 'below'} it`
    });
  }
  if (last.volumeSma20) {
    const ratio = last.volume / last.volumeSma20;
    signals.push({ indicator: 'Volume', value: round(ratio, 2), signal: 'neutral', detail: `Volume is ${round(ratio, 2)}x its 20-day average` });
  }
  const bullish = signals.filter((s) => s.signal === 'bullish').length;
  const bearish = signals.filter((s) => s.signal === 'bearish').length;
  const bias = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';

  return { series: series.slice(-range), latest: last, signals, bias, counts: { bullish, bearish, neutral: signals.length - bullish - bearish } };
}
