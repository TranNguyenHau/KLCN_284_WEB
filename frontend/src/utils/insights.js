/**
 * Turns the indicator series the API already returns into an explainable list of
 * technical factors. Every sentence is built from a real indicator value; nothing
 * here estimates a price and nothing is attributed to the model's internals.
 *
 * Factors carry i18n keys plus interpolation vars so the panel re-renders on a
 * language switch instead of freezing pre-translated strings.
 */
import { fmtPrice } from './format.js';

export function buildInsights({ latest, series } = {}) {
  if (!latest) return null;
  const prev = Array.isArray(series) && series.length > 1 ? series[series.length - 2] : null;
  const factors = [];

  // 1. Trend versus the moving averages.
  const { close, sma20, sma50 } = latest;
  if (close != null && sma50) {
    // Format through the i18n locale so the sentence reads "3,2%" in Vietnamese.
    const pct = fmtPrice(Math.abs(((close - sma50) / sma50) * 100), 1);
    const alignedUp = close > sma50 && sma20 != null && sma20 > sma50;
    const alignedDown = close < sma50 && sma20 != null && sma20 < sma50;
    factors.push({
      key: 'trend',
      signal: alignedUp ? 'bullish' : alignedDown ? 'bearish' : 'neutral',
      titleKey: 'insights.trendTitle',
      textKey: alignedUp ? 'insights.trendAbove' : alignedDown ? 'insights.trendBelow' : 'insights.trendMixed',
      vars: { pct }
    });
  }

  // 2. RSI momentum, including the crossover that most often precedes a turn.
  if (latest.rsi != null) {
    const value = fmtPrice(latest.rsi, 1);
    const crossedUp = prev?.rsi != null && prev.rsi < 30 && latest.rsi >= 30;
    const crossedDown = prev?.rsi != null && prev.rsi < 70 && latest.rsi >= 70;
    let signal = 'neutral';
    let textKey = 'insights.rsiNeutral';
    if (crossedUp) {
      signal = 'bullish';
      textKey = 'insights.rsiCrossUp';
    } else if (crossedDown) {
      signal = 'bearish';
      textKey = 'insights.rsiCrossDown';
    } else if (latest.rsi >= 70) {
      signal = 'bearish';
      textKey = 'insights.rsiOverbought';
    } else if (latest.rsi <= 30) {
      signal = 'bullish';
      textKey = 'insights.rsiOversold';
    }
    factors.push({ key: 'rsi', signal, titleKey: 'insights.rsiTitle', textKey, vars: { value } });
  }

  // 3. MACD momentum and whether the histogram is expanding or fading.
  if (latest.macdHistogram != null) {
    const above = latest.macdHistogram >= 0;
    const rising = prev?.macdHistogram != null && latest.macdHistogram > prev.macdHistogram;
    factors.push({
      key: 'macd',
      signal: latest.macdHistogram > 0 ? 'bullish' : latest.macdHistogram < 0 ? 'bearish' : 'neutral',
      titleKey: 'insights.macdTitle',
      textKey: `insights.macd${above ? 'Above' : 'Below'}${rising ? 'Rising' : 'Falling'}`
    });
  }

  // 4. Volume against its 20-day average: spike, quiet drift, or business as usual.
  if (latest.volume != null && latest.volumeSma20) {
    // Keep the numeric value for the comparisons, format a copy for the sentence.
    const ratioValue = latest.volume / latest.volumeSma20;
    const ratio = fmtPrice(ratioValue, 2);
    const rising = prev?.close != null && close >= prev.close;
    const spike = ratioValue >= 1.5;
    const quiet = ratioValue <= 0.7;
    factors.push({
      key: 'volume',
      signal: spike ? (rising ? 'bullish' : 'bearish') : 'neutral',
      titleKey: 'insights.volumeTitle',
      textKey: spike ? 'insights.volumeSpike' : quiet ? 'insights.volumeQuiet' : 'insights.volumeNormal',
      vars: { ratio }
    });
  }

  // 5. Where price sits inside the Bollinger band.
  if (close != null && latest.bbUpper != null && latest.bbLower != null && latest.bbUpper !== latest.bbLower) {
    const position = (close - latest.bbLower) / (latest.bbUpper - latest.bbLower);
    factors.push({
      key: 'bands',
      signal: position > 1 ? 'bearish' : position < 0 ? 'bullish' : 'neutral',
      titleKey: 'insights.bandsTitle',
      textKey: position > 1 ? 'insights.bandsUpper' : position < 0 ? 'insights.bandsLower' : 'insights.bandsMid',
      vars: { pct: Math.round(position * 100) }
    });
  }

  const directional = factors.filter((factor) => factor.signal !== 'neutral');
  const bullish = directional.filter((factor) => factor.signal === 'bullish').length;
  const bearish = directional.length - bullish;
  const agreement = directional.length ? Math.round((Math.max(bullish, bearish) / directional.length) * 100) : 0;

  return {
    factors,
    bullish,
    bearish,
    neutral: factors.length - directional.length,
    directionalCount: directional.length,
    agreement,
    bias: bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral',
    verdictKey: agreement >= 80 ? 'insights.confidenceStrong' : agreement >= 55 ? 'insights.confidenceMixed' : 'insights.confidenceWeak'
  };
}
