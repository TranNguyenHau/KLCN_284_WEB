import { EventEmitter } from 'node:events';
import { getProvider } from '../providers/index.js';

const bus = new EventEmitter();

export function publishTick(tick) {
  bus.emit('tick', tick);
}

export function subscribe(symbol, handler) {
  const listener = (tick) => {
    if (tick.symbol === symbol) handler(tick);
  };
  bus.on('tick', listener);
  return () => bus.off('tick', listener);
}

export function streamStatus() {
  const provider = getProvider();
  return provider.isRealtime
    ? { live: true, provider: provider.name }
    : { live: false, provider: provider.name, message: 'No real-time market data provider is connected' };
}
