// POST /api/rpc: a read-only JSON-RPC proxy to SOLANA_RPC for the site's pages (ui/data.js `rpc`). Only the read methods the pages
// use are forwarded; nothing that sends a transaction (a wallet sends its own). The upstream URL (it may carry a provider key) never
// appears in an answer: upstream failures come back as a generic JSON-RPC error. Batches up to 10 calls.
const PROGRAM = process.env.IA_PROGRAM || 'CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr';
const READ = new Set([
  'getAccountInfo', 'getMultipleAccounts', 'getProgramAccounts', 'getBalance', 'getSlot', 'getBlockHeight', 'getEpochInfo', 'getHealth',
  'getVersion', 'getLatestBlockhash', 'isBlockhashValid', 'getFeeForMessage', 'getMinimumBalanceForRentExemption',
  'getSignaturesForAddress', 'getSignatureStatuses', 'getTransaction', 'getTokenAccountsByOwner', 'getTokenAccountBalance',
  'getTokenSupply', 'simulateTransaction',
]);
const MAX_BODY = 64 * 1024;
const MAX_BATCH = 10;

const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** null when the call may go upstream, else the reason */
export function refuse(call) {
  if (!call || typeof call !== 'object' || call.jsonrpc !== '2.0' || typeof call.method !== 'string') return 'not a JSON-RPC 2.0 call';
  if (!READ.has(call.method)) return `method ${call.method} is not served here (read-only proxy)`;
  const p = call.params === undefined ? [] : call.params;
  if (!Array.isArray(p)) return 'params must be an array';
  if (call.method === 'getProgramAccounts') {
    // only the ia program, and only with filters: an unfiltered scan of a large program is not a page's job
    if (p[0] !== PROGRAM) return 'getProgramAccounts is served for the ia program only';
    const f = p[1] && p[1].filters;
    if (!Array.isArray(f) || !f.length) return 'getProgramAccounts needs filters';
  }
  if (call.method === 'getTransaction') {
    // mainnet carries version-1 transactions: ask for them explicitly (a request without the field fails on any of them)
    const o = p[1];
    if (!o || typeof o !== 'object' || typeof o.maxSupportedTransactionVersion !== 'number') return 'getTransaction needs maxSupportedTransactionVersion';
  }
  if (call.method === 'simulateTransaction') {
    const o = p[1];
    if (o && o.accounts) return 'simulateTransaction without returned accounts';
  }
  return null;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (raw === null) {
    raw = '';
    for await (const c of req) { raw += c; if (raw.length > MAX_BODY) throw Object.assign(Error('too large'), { status: 413 }); }
  }
  if (raw.length > MAX_BODY) throw Object.assign(Error('too large'), { status: 413 });
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return res.status(405).send(JSON.stringify(fail(null, -32600, 'POST a JSON-RPC call'))); }
  const upstream = process.env.SOLANA_RPC;
  if (!upstream) return res.status(503).send(JSON.stringify(fail(null, -32603, 'no RPC configured on this server')));
  let body;
  try { body = await readBody(req); } catch (e) { return res.status(e.status || 400).send(JSON.stringify(fail(null, -32700, e.status === 413 ? 'request too large' : 'parse error'))); }
  const batch = Array.isArray(body);
  const calls = batch ? body : [body];
  if (!calls.length || calls.length > MAX_BATCH) return res.status(400).send(JSON.stringify(fail(null, -32600, `send 1 to ${MAX_BATCH} calls`)));
  const out = new Array(calls.length);
  const send = [];
  calls.forEach((c, i) => { const why = refuse(c); if (why) out[i] = fail(c && c.id, -32601, why); else send.push([i, { jsonrpc: '2.0', id: c.id ?? i, method: c.method, params: c.params ?? [] }]); });
  // one upstream request per call (some providers refuse batches); a 429 from upstream is passed on as a 429
  let limited = false;
  await Promise.all(send.map(async ([i, c]) => {
    try {
      const r = await fetch(upstream, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c), signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { limited = true; out[i] = fail(calls[i].id, -32005, 'the RPC is rate limiting; retry in a moment'); return; }
      const a = await r.json();
      const id = calls[i].id ?? null;
      if (a && a.error) out[i] = { jsonrpc: '2.0', id, error: { code: a.error.code, message: String(a.error.message || 'error'), ...(a.error.data !== undefined ? { data: a.error.data } : {}) } };
      else if (a && a.result !== undefined) out[i] = { jsonrpc: '2.0', id, result: a.result };
      else out[i] = fail(id, -32603, 'the RPC did not answer');
    } catch { out[i] = fail(calls[i].id, -32603, 'the RPC did not answer, try again'); }
  }));
  if (limited && !batch) { res.setHeader('retry-after', '2'); return res.status(429).send(JSON.stringify(out[0])); }
  res.status(200).send(JSON.stringify(batch ? out : out[0]));
}
