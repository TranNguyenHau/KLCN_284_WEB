import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
process.env.DOTENV_CONFIG_PATH = '__no_test_env__';
axios.defaults.adapter = async config => ({ status: 200, statusText: 'OK', headers: {}, config, data: config.url === '/stocks' ? { stocks: [{ symbol: 'FPT', company: 'FPT' }] } : { prices: [{ date: '2026-11-05', open: 52, high: 53, low: 51, close: 52.9, volume: 100 }] } });
const { config } = await import('../config.js');
const { composeReply } = await import('../services/agent/composer.js');
test('Flask price 52.9 retains decimals and thousand-VND unit through provider', async () => {
  config.stocktrainPriceMultiplier = 1;
  const provider = await import('../providers/stocktrainProvider.js?unit=raw');
  const quote = await provider.getQuote('FPT');
  assert.equal(quote.price, 52.9); assert.equal(quote.priceToVnd, 1000);
  const reply = composeReply({ symbol: 'FPT', evidence: { price: quote }, language: 'vi' });
  assert.match(reply, /52,9 nghìn VND/); assert.doesNotMatch(reply, /53 VND/);
});
test('configured multiplier 1000 does not multiply the displayed price twice', async () => {
  config.stocktrainPriceMultiplier = 1000;
  const provider = await import('../providers/stocktrainProvider.js?unit=scaled');
  const quote = await provider.getQuote('FPT');
  assert.equal(quote.price, 52900); assert.equal(quote.priceToVnd, 1);
  assert.match(composeReply({ symbol: 'FPT', evidence: { price: quote }, language: 'vi' }), /52\.900 VND/);
});
test('history uses its own price unit; existing VND providers stay VND', () => {
  const history = { low52w: 51.1, high52w: 53.2, change30dPercent: 1, change90dPercent: 2, priceToVnd: 1000 };
  assert.match(composeReply({ symbol: 'FPT', evidence: { history }, language: 'vi' }), /51,1 nghìn VND/);
  const price = { price: 52900, changePercent: 0 };
  assert.match(composeReply({ symbol: 'FPT', evidence: { price }, language: 'vi' }), /52\.900 VND/);
});
