// Google Gemini API adapter (generateContent, function calling). The key goes in the x-goog-api-key header, never in the URL.
// The model's own content (with thought signatures) is passed back unchanged on the next turn. Function calls without an id get a
// local id `g<turn>.<k>`; the functionResponse carries the provider id only when the provider gave one.
import { keyFor } from './keys.mjs';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const RETRY = new Set([408, 429, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Gemini takes an OpenAPI subset: no additionalProperties / strict. */
function schema(s) {
  if (Array.isArray(s)) return s.map(schema);
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) if (k !== 'additionalProperties' && k !== '$schema') o[k] = schema(v);
  return o;
}

export function toNative(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.text }] });
    else if (m.role === 'assistant') out.push(m.native);
    else if (m.role === 'tool') {
      out.push({
        role: 'user',
        parts: m.results.map(r => {
          let response;
          try { response = JSON.parse(r.content); } catch { response = { text: r.content }; }
          if (Array.isArray(response) || typeof response !== 'object' || response === null) response = { result: response };
          return { functionResponse: { name: r.name, ...(r.nativeId ? { id: r.nativeId } : {}), response } };
        }),
      });
    }
  }
  return out;
}

export function buildRequest({ system, messages, tools, maxTokens, temperature, thinkingBudget }) {
  const gen = { maxOutputTokens: maxTokens };
  if (temperature !== undefined && temperature !== null) gen.temperature = temperature;
  if (thinkingBudget !== undefined && thinkingBudget !== null) gen.thinkingConfig = { thinkingBudget };
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: toNative(messages),
    tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: schema(t.parameters) })) }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: gen,
  };
}

let turn = 0;
export async function call({ model, system, messages, tools, maxTokens, temperature, thinkingBudget }) {
  const body = buildRequest({ system, messages, tools, maxTokens, temperature, thinkingBudget });
  const text = JSON.stringify(body);
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try {
      r = await fetch(BASE + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': keyFor('google'), 'content-type': 'application/json' },
        body: text,
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) { last = e; await sleep(2000 * 2 ** attempt); continue; }
    const raw = await r.json().catch(() => ({}));
    if (r.ok) {
      const cand = (raw.candidates || [])[0] || {};
      const content = cand.content || { role: 'model', parts: [] };
      const t = ++turn;
      const toolCalls = (content.parts || []).filter(p => p.functionCall).map((p, k) => ({
        id: p.functionCall.id || `g${t}.${k}`, nativeId: p.functionCall.id || null, name: p.functionCall.name, input: p.functionCall.args || {},
      }));
      const u = raw.usageMetadata || {};
      const cached = u.cachedContentTokenCount || 0;
      return {
        request: body,
        raw,
        message: content.role ? content : { ...content, role: 'model' },
        toolCalls,
        text: (content.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('\n'),
        stopReason: toolCalls.length ? 'tool_use' : (cand.finishReason || 'STOP'),
        requestId: raw.responseId || '',
        httpRequestId: '',
        modelVersion: raw.modelVersion || model,
        usage: { in: (u.promptTokenCount || 0) - cached, out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), cached, cacheWrite: 0 },
      };
    }
    last = Object.assign(Error(`google ${r.status}: ${(raw.error && raw.error.message) || ''}`.slice(0, 400)), { status: r.status, raw });
    if (!RETRY.has(r.status)) throw last;
    await sleep(2000 * 2 ** attempt);
  }
  throw last;
}
