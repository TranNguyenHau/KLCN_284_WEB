import * as sample from './sampleProvider.js';
import { config } from '../config.js';

const registry = { sample };

export function getProvider() {
  return registry[config.marketDataProvider] || sample;
}
