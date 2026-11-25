// USD per 1M tokens, used by the budget guard and the spend ledger. Anthropic first-party list prices as of 2026-11 (cache writes
// 1.25x input, cache reads as listed). Entries marked `estimate` are guard values until a provider's price is checked; the guard
// errs high on purpose.
export const PRICES = {
  'anthropic/claude-haiku-5-5': { in: 0.10, out: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
  'anthropic/claude-sonnet-5-5': { in: 2.00, out: 10.00, cacheRead: 0.10, cacheWrite: 2.50 },
  'anthropic/claude-opus-5-5': { in: 4.00, out: 20.00, cacheRead: 0.20, cacheWrite: 5.00 },
  'google/*': { in: 0.50, out: 3.00, cacheRead: 0.125, cacheWrite: 0.50, estimate: true },
  'openai/gpt-6.2-astra': { in: 8.00, out: 40.00, cacheRead: 0.80, cacheWrite: 8.00, estimate: true },
  'enrol/*': { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  '*': { in: 10.00, out: 50.00, cacheRead: 1.00, cacheWrite: 12.50, estimate: true },
};
export function priceOf(model) {
  if (PRICES[model]) return PRICES[model];
  const prov = model.split('/')[0];
  return PRICES[prov + '/*'] || PRICES['*'];
}
/** usage: { in (uncached input), out (incl. thinking), cached (cache reads), cacheWrite } */
export function costOf(model, u) {
  const p = priceOf(model);
  return ((u.in || 0) * p.in + (u.out || 0) * p.out + (u.cached || 0) * p.cacheRead + (u.cacheWrite || 0) * p.cacheWrite) / 1e6;
}
