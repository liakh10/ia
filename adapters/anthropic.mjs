// Anthropic Messages API adapter (raw HTTPS so the transcript holds the exact request body and the exact response body with the
// provider's message id; the egress guard sees every connection). Claude 5.5 models: adaptive thinking is the default and cannot be
// turned off on Opus 5.5, sampling parameters are rejected (so `temperature` is not sent), forced tool_choice is rejected (we use
// auto). No server-side fallbacks: a fallback would answer with another model than the one under test; a refusal is returned as is.
import { keyFor } from './keys.mjs';

const URL_ = 'https://api.anthropic.com/v1/messages';
const RETRY = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function toNative(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: [{ type: 'text', text: m.text }] });
    else if (m.role === 'assistant') out.push(m.native);
    else if (m.role === 'tool') {
      out.push({ role: 'user', content: m.results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })) });
    }
  }
  return out;
}

export function buildRequest({ model, system, messages, tools, maxTokens, effort }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system }],
    messages: toNative(messages),
    tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })),
    tool_choice: { type: 'auto' },
    cache_control: { type: 'ephemeral' },
  };
  if (effort) body.output_config = { effort };
  return body;
}

export async function call({ model, system, messages, tools, maxTokens, effort }) {
  const body = buildRequest({ model, system, messages, tools, maxTokens, effort });
  const text = JSON.stringify(body);
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try {
      r = await fetch(URL_, {
        method: 'POST',
        headers: { 'x-api-key': keyFor('anthropic'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: text,
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) { last = e; await sleep(2000 * 2 ** attempt); continue; }
    const raw = await r.json().catch(() => ({}));
    if (r.ok) {
      const u = raw.usage || {};
      return {
        request: body,
        raw,
        message: { role: 'assistant', content: raw.content },
        toolCalls: (raw.content || []).filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input })),
        text: (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n'),
        stopReason: raw.stop_reason,
        requestId: raw.id,
        httpRequestId: r.headers.get('request-id') || '',
        modelVersion: raw.model,
        usage: { in: u.input_tokens || 0, out: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 },
      };
    }
    last = Object.assign(Error(`anthropic ${r.status}: ${(raw.error && raw.error.message) || ''}`.slice(0, 400)), { status: r.status, raw });
    if (!RETRY.has(r.status)) throw last;
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt);
  }
  throw last;
}
