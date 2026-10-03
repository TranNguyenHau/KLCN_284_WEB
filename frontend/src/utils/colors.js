/**
 * Recharts needs concrete colour strings, so this map mirrors the semantic tokens
 * in `index.css`. Keep the two in step: dark values follow the dark palette
 * (up #10B981, down #EF4444, forecast #818CF8), light values the light palette.
 */
export const chartColors = {
  light: {
    up: '#059669',
    down: '#dc2626',
    forecast: '#6366f1',
    accent: '#0284c7',
    grid: '#e2e8f0',
    axis: '#64748b',
    ma1: '#d97706',
    ma2: '#0284c7',
    ma3: '#64748b',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e8f0',
    ink: '#0f172a'
  },
  dark: {
    up: '#10b981',
    down: '#ef4444',
    forecast: '#818cf8',
    accent: '#38bdf8',
    grid: '#2b3b54',
    axis: '#94a3b8',
    ma1: '#fbbf24',
    ma2: '#38bdf8',
    ma3: '#94a3b8',
    tooltipBg: '#1e293b',
    tooltipBorder: '#334155',
    ink: '#e2e8f0'
  }
};
