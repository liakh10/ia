// OpenAI-compatible Chat Completions adapter: OpenAI, xAI, OpenRouter (Qwen and others) and the Vercel AI Gateway share this shape.
// Provider prefix → base URL and key. Written to the documented wire shape; not yet exercised against a live endpoint (no keys on this
// machine at the time of writing) — the first live call must be checked by hand.
import { keyFor } from './keys.mjs';

export const BASES = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gateway: 'https://ai-gateway.vercel.sh/v1',
};
const RETRY = new Set([408, 429, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function toNative(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant') out.push(m.native);
    else if (m.role === 'tool') for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.content });
  }
  return out;
}

export function buildRequest({ model, system, messages, tools, maxTokens, temperature }) {
  const body = {
    model,
    messages: toNative(system, messages),
    tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters, strict: true } })),
    tool_choice: 'auto',
    max_completion_tokens: maxTokens,
  };
  if (temperature !== undefined && temperature !== null) body.temperature = temperature;
  return body;
}

export async function call({ provider, model, system, messages, tools, maxTokens, temperature }) {
  const body = buildRequest({ model, system, messages, tools, maxTokens, temperature });
  const text = JSON.stringify(body);
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try {
      r = await fetch(BASES[provider] + '/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + keyFor(provider), 'content-type': 'application/json' },
        body: text,
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) { last = e; await sleep(2000 * 2 ** attempt); continue; }
    const raw = await r.json().catch(() => ({}));
    if (r.ok) {
      const ch = (raw.choices || [])[0] || {};
      const msg = ch.message || { role: 'assistant', content: '' };
      const toolCalls = (msg.tool_calls || []).map(tc => {
        let input;
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch { input = { _unparsed: tc.function.arguments }; }
        return { id: tc.id, name: tc.function.name, input };
      });
      const u = raw.usage || {};
      const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
      return {
        request: body,
        raw,
        message: msg,
        toolCalls,
        text: typeof msg.content === 'string' ? msg.content : '',
        stopReason: toolCalls.length ? 'tool_use' : (ch.finish_reason || 'stop'),
        requestId: raw.id || '',
        httpRequestId: r.headers.get('x-request-id') || '',
        modelVersion: raw.model || model,
        usage: { in: (u.prompt_tokens || 0) - cached, out: u.completion_tokens || 0, cached, cacheWrite: 0 },
      };
    }
    last = Object.assign(Error(`${provider} ${r.status}: ${(raw.error && raw.error.message) || ''}`.slice(0, 400)), { status: r.status, raw });
    if (!RETRY.has(r.status)) throw last;
    await sleep(2000 * 2 ** attempt);
  }
  throw last;
}
