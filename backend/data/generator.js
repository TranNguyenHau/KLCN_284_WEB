function hash(str) {
  let h = 2166136261;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r) {
  let u = 0;
  let v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function businessDays(count, end = new Date()) {
  const days = [];
  const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (days.length < count) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
}

export function generateSeries({ symbol, base, volatility, drift, avgVolume = 1000000, tick = 100, count = 520, decimals = 0 }) {
  const r = rng(hash(symbol));
  const raw = [];
  let p = 1;
  let cycle = 0;
  for (let i = 0; i < count; i++) {
    cycle += 0.045;
    p *= Math.exp(drift + volatility * gauss(r) + 0.0012 * Math.sin(cycle));
    raw.push(p);
  }
  const scale = base / raw[count - 1];
  const factor = 10 ** decimals;
  const snap = (v) => Math.round(v / tick) * tick;
  const dates = businessDays(count);
  const rows = [];
  let prevClose = null;
  for (let i = 0; i < count; i++) {
    const close = snap(raw[i] * scale * factor) / factor;
    const open = prevClose == null ? close : snap(prevClose * (1 + 0.004 * gauss(r)) * factor) / factor;
    const high = snap(Math.max(open, close) * (1 + Math.abs(0.006 * gauss(r))) * factor) / factor;
    const low = snap(Math.min(open, close) * (1 - Math.abs(0.006 * gauss(r))) * factor) / factor;
    const volume = Math.max(Math.round(avgVolume * 0.2), Math.round(avgVolume * (1 + 0.35 * gauss(r))));
    rows.push({ date: dates[i], open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume });
    prevClose = close;
  }
  return rows;
}
