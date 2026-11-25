// The one model contract (BUILD §Interfaces 2) for every provider in the lineup:
//
//   callModel({ agentId, model, system, messages, tools, maxTokens, temperature, effort, purpose })
//     → { message, toolCalls: [{ id, name, input }], text, stopReason, requestId, modelVersion, usage: { in, out, cached, cacheWrite },
//         usd, request, raw }
//
// `model` is the exact version string recorded on chain, `<provider>/<id>`: anthropic/claude-opus-5-5, google/gemini-…, openai/…,
// xai/…, openrouter/qwen/…, gateway/<provider>/<id>. `messages` is provider-neutral:
//   { role: 'user', text } | { role: 'assistant', native } (the `message` a previous call returned, passed back unchanged)
//   | { role: 'tool', results: [{ id, nativeId?, name, content: string, isError? }] }
// `tools`: [{ name, description, parameters: JSON Schema (additionalProperties: false, every property required) }].
// Every call passes the budget guard first and is written to the spend ledger after. `temperature` is dropped for models whose API
// rejects sampling parameters (Claude 5.5); `request` is the exact body sent, so the transcript records what was really asked.
import * as anthropic from './anthropic.mjs';
import * as google from './google.mjs';
import * as openai from './openai.mjs';
import { guard, record } from './budget.mjs';
import { hasKey } from './keys.mjs';

export { BudgetExceeded, spentToday, LEDGER } from './budget.mjs';
export { hasKey };

export function parseModel(model) {
  const i = model.indexOf('/');
  if (i < 0) throw Error(`model must be <provider>/<id>: ${model}`);
  return { provider: model.slice(0, i), id: model.slice(i + 1) };
}

const NO_SAMPLING = /^anthropic\/claude-(opus|sonnet|haiku|fable|mythos)-5/;

export async function callModel({ agentId = '', model, system, messages, tools, maxTokens = 8000, temperature = 0, effort, thinkingBudget, purpose = '' }) {
  const { provider, id } = parseModel(model);
  const temp = NO_SAMPLING.test(model) ? undefined : temperature;
  guard(model, system.length + JSON.stringify(messages).length + JSON.stringify(tools).length, maxTokens);
  let res;
  if (provider === 'anthropic') res = await anthropic.call({ model: id, system, messages, tools, maxTokens, effort });
  else if (provider === 'google') res = await google.call({ model: id, system, messages, tools, maxTokens, temperature: temp, thinkingBudget });
  else if (openai.BASES[provider]) res = await openai.call({ provider, model: id, system, messages, tools, maxTokens, temperature: temp });
  else throw Error(`no adapter for provider ${provider}`);
  res.usd = record({ lineupAgent: agentId, model, usage: res.usage, requestId: res.requestId, purpose });
  res.provider = provider;
  res.versionMatch = sameVersion(id, res.modelVersion);
  return res;
}

/** The provider's answer names the model that ran. An alias (e.g. "-latest") resolving to a dated version is not a mismatch only when
 *  the declared id is that alias; anything else is flagged in the transcript (a version change opens a new epoch, SPEC §6). */
export function sameVersion(declared, served) {
  if (!served) return false;
  const a = String(declared).replace(/^models\//, ''), b = String(served).replace(/^models\//, '');
  return a === b || b.startsWith(a + '-') || /latest$/.test(a);
}
