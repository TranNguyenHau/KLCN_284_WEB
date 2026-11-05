import * as sample from './sampleProvider.js';
import * as stocktrain from './stocktrainProvider.js';
import { config } from '../config.js';

const registry = { sample, stocktrain };

export function getProvider() {
  return registry[config.marketDataProvider] || sample;
}
