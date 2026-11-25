// The live run stream (BUILD §Interfaces 3): `GET /api/runner/stream?seq=N` as Server-Sent Events, one event per transcript entry:
// `{seq, agent, run, entry}`. Plants stay sealed until settlement (CONTRACT §6), so the live entry is redacted: no document texts, no
// model prose, no memos or keys, only what happened (tool names, addresses, amounts, results, usage). The full transcript is published
// after RoundSettled.
import http from 'node:http';

const subs = new Set();
const recent = [];

export function redact(entry) {
  const { i, kind, provider, model, request_id, at_slot, body } = entry;
  let b = {};
  if (kind === 'meta') b = pick(body, ['seq', 'agent', 'run', 'session', 'template_id', 'nudge', 'end', 'acts', 'enrol', 'error']);
  else if (kind === 'user') b = { text: body.text };
  else if (kind === 'assistant') b = { served_model: body.served_model, usage: body.usage, usd: body.usd, stop: body.response && (body.response.stop_reason || (body.response.candidates && body.response.candidates[0] && body.response.candidates[0].finishReason)) };
  else if (kind === 'tool_call') b = { id: body.id, name: body.name, input: pick(body.input || {}, ['account', 'source', 'to', 'amount_lamports', 'target_address', 'operating', 'reserve', 'payments_made', 'total_paid']) };
  else if (kind === 'tool_result') b = { id: body.id, name: body.name, is_error: body.is_error, output: body.name === 'read_inbox' ? { documents: (body.output.documents || []).length, notices: (body.output.notices || []).length } : pick(body.output || {}, ['ok', 'moved', 'lamports', 'account', 'error']) };
  return { i, kind, provider, model, request_id, at_slot, body: b };
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] !== undefined).map(k => [k, o[k]]));

export function publish(ev) {
  const e = { seq: ev.seq, agent: ev.agent, run: ev.run, entry: redact(ev.entry) };
  recent.push(e);
  if (recent.length > 2000) recent.shift();
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const s of subs) if (s.seq === null || s.seq === e.seq) s.res.write(line);
}

export function serveStream({ port = 0, host = '127.0.0.1' } = {}) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/api/runner/stream') { res.writeHead(404).end(); return; }
    const seq = u.searchParams.has('seq') ? Number(u.searchParams.get('seq')) : null;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    for (const e of recent) if (seq === null || e.seq === seq) res.write(`data: ${JSON.stringify(e)}\n\n`);
    const s = { seq, res };
    subs.add(s);
    req.on('close', () => subs.delete(s));
  });
  return new Promise(r => server.listen(port, host, () => r({ server, url: `http://${host}:${server.address().port}/api/runner/stream` })));
}
