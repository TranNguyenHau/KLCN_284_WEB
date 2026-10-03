import { fmtCompact, fmtDateTime, fmtPrice, fmtPct } from './format.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const cell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One tidy table: actual bars and LSTM predictions share a `type` column. */
export function downloadHistoryCsv({ symbol, history = [], predictions = [] }) {
  const header = ['type', 'date', 'open', 'high', 'low', 'close', 'volume', 'predicted_price', 'lower', 'upper'];
  const rows = [
    header,
    ...history.map((bar) => ['actual', bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume, '', '', '']),
    ...predictions.map((point) => ['predicted', point.date, '', '', '', '', '', point.predicted_price, point.lower ?? '', point.upper ?? ''])
  ];
  // The BOM keeps Vietnamese characters intact when the file opens in Excel.
  triggerDownload(new Blob([`\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8;' }), `${symbol}-history-prediction.csv`);
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">-</td></tr>`
  }</tbody></table>`;
}

/**
 * Opens a print-ready report in a new window. The browser's own PDF export is used
 * so the app ships no PDF dependency.
 */
export function openSummaryReport({ symbol, name, quote, prediction, indicators, history = [], labels }) {
  const win = window.open('', '_blank', 'width=920,height=1000');
  if (!win) return false;

  const generated = fmtDateTime(new Date());
  const l = labels;

  const quoteRows = quote
    ? [
        [l.price, `${fmtPrice(quote.price)} ${l.currency}`],
        [l.change, `${fmtPrice(quote.change)} (${fmtPct(quote.changePercent)})`],
        [l.open, fmtPrice(quote.open)],
        [l.high, fmtPrice(quote.high)],
        [l.low, fmtPrice(quote.low)],
        [l.previousClose, fmtPrice(quote.previousClose)],
        [l.volume, fmtCompact(quote.volume)],
        [l.date, quote.asOf]
      ]
    : [];

  const predictionRows = (prediction?.predictions || []).map((point) => [point.date, fmtPrice(point.predicted_price), point.lower != null ? `${fmtPrice(point.lower)} - ${fmtPrice(point.upper)}` : '—']);
  const signalRows = (indicators?.signals || []).map((signal) => [signal.indicator, fmtPrice(signal.value, 2), signal.signal, signal.detail]);
  const historyRows = history.slice(-20).reverse().map((bar) => [bar.date, fmtPrice(bar.open), fmtPrice(bar.high), fmtPrice(bar.low), fmtPrice(bar.close), fmtCompact(bar.volume)]);

  win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(l.title.replace('{symbol}', symbol))}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 13px/1.55 "Segoe UI", system-ui, sans-serif; color: #0f172a; background: #fff; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 26px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #475569; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; }
  .mark { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: #0f172a; color: #38bdf8; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; }
  th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
  td:last-child, th:last-child { text-align: right; }
  .disclaimer { margin-top: 26px; padding: 12px 14px; border-radius: 10px; background: #f1f5f9; color: #475569; font-size: 12px; }
  @media print { body { padding: 12mm; } }
</style></head><body>
  <div class="brand"><span class="mark">α</span> Alpha Markets</div>
  <h1>${escapeHtml(l.title.replace('{symbol}', symbol))}</h1>
  <p class="meta">${escapeHtml(name || '')}${name ? ' · ' : ''}${escapeHtml(l.generated.replace('{date}', generated))}</p>
  ${quoteRows.length ? `<h2>${escapeHtml(l.quote)}</h2>${table([l.metric, l.value], quoteRows)}` : ''}
  ${predictionRows.length ? `<h2>${escapeHtml(l.prediction.replace('{days}', String(prediction.predictions.length)))}</h2>${table([l.date, l.predictedPrice, l.range], predictionRows)}` : ''}
  ${signalRows.length ? `<h2>${escapeHtml(l.indicators)}</h2>${table([l.indicator, l.value, l.signal, l.note], signalRows)}` : ''}
  ${historyRows.length ? `<h2>${escapeHtml(l.history)}</h2>${table([l.date, l.open, l.high, l.low, l.close, l.volume], historyRows)}` : ''}
  <p class="disclaimer">${escapeHtml(l.disclaimer)}</p>
</body></html>`);

  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
  return true;
}
