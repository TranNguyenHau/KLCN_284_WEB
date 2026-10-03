import { useTheme } from './useTheme.jsx';
import { chartColors } from '../utils/colors.js';

export function useChartColors() {
  const { theme } = useTheme();
  return chartColors[theme] || chartColors.dark;
}
