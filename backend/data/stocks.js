export const STOCKS = [
  { symbol: 'VIC', name: 'Vingroup JSC', sector: 'Real Estate', exchange: 'HOSE', basePrice: 102500, avgVolume: 2400000, volatility: 0.019, drift: 0.0004 },
  { symbol: 'VHM', name: 'Vinhomes JSC', sector: 'Real Estate', exchange: 'HOSE', basePrice: 45200, avgVolume: 3800000, volatility: 0.02, drift: 0.0002 },
  { symbol: 'VNM', name: 'Vinamilk', sector: 'Consumer Staples', exchange: 'HOSE', basePrice: 65800, avgVolume: 2100000, volatility: 0.012, drift: 0.0001 },
  { symbol: 'VCB', name: 'Vietcombank', sector: 'Banking', exchange: 'HOSE', basePrice: 92400, avgVolume: 1900000, volatility: 0.013, drift: 0.0003 },
  { symbol: 'TCB', name: 'Techcombank', sector: 'Banking', exchange: 'HOSE', basePrice: 24600, avgVolume: 9500000, volatility: 0.017, drift: 0.0003 },
  { symbol: 'VPB', name: 'VPBank', sector: 'Banking', exchange: 'HOSE', basePrice: 19300, avgVolume: 14000000, volatility: 0.018, drift: 0.0002 },
  { symbol: 'HPG', name: 'Hoa Phat Group', sector: 'Materials', exchange: 'HOSE', basePrice: 27400, avgVolume: 21000000, volatility: 0.019, drift: 0.0003 },
  { symbol: 'FPT', name: 'FPT Corporation', sector: 'Technology', exchange: 'HOSE', basePrice: 125800, avgVolume: 2600000, volatility: 0.015, drift: 0.0006 },
  { symbol: 'MWG', name: 'Mobile World Group', sector: 'Retail', exchange: 'HOSE', basePrice: 61300, avgVolume: 4200000, volatility: 0.02, drift: 0.0004 },
  { symbol: 'MSN', name: 'Masan Group', sector: 'Consumer Staples', exchange: 'HOSE', basePrice: 70100, avgVolume: 1700000, volatility: 0.017, drift: 0.0001 },
  { symbol: 'GAS', name: 'PV Gas', sector: 'Energy', exchange: 'HOSE', basePrice: 71500, avgVolume: 900000, volatility: 0.014, drift: 0 },
  { symbol: 'SSI', name: 'SSI Securities', sector: 'Financial Services', exchange: 'HOSE', basePrice: 30200, avgVolume: 12000000, volatility: 0.022, drift: 0.0002 }
];

// Ticker-tape indices. `tick` is the rounding step and `decimals` the display precision,
// so a 64,250 BTC level does not get two meaningless decimals.
export const INDICES = [
  { symbol: 'VNINDEX', name: 'VN-Index', base: 1285.4, volatility: 0.009, drift: 0.0002, tick: 0.01, decimals: 2 },
  { symbol: 'VN30', name: 'VN30', base: 1342.7, volatility: 0.01, drift: 0.0002, tick: 0.01, decimals: 2 },
  { symbol: 'HNX', name: 'HNX-Index', base: 236.8, volatility: 0.011, drift: 0.0001, tick: 0.01, decimals: 2 },
  { symbol: 'SPX', name: 'S&P 500', base: 5487.03, volatility: 0.008, drift: 0.0003, tick: 0.01, decimals: 2 },
  { symbol: 'BTC', name: 'Bitcoin', base: 64250, volatility: 0.028, drift: 0.0005, tick: 1, decimals: 0 }
];
