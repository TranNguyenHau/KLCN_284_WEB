const KEY = 'alpha.recent-symbols';
const LIMIT = 5;

export function readRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberSymbol(symbol) {
  if (!symbol) return;
  try {
    const next = [symbol, ...readRecents().filter((item) => item !== symbol)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage can be blocked in private modes */
  }
}
