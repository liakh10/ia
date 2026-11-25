// Drives one run with a model through the adapter contract: kickoff → callModel → every tool call through the sandbox → results back,
// until the report is filed, the model stops (one fixed reminder, then stop), a cap is hit, the window is about to close, or the
// provider refuses. Every request's settings and every raw response go into the transcript.
import { callModel, BudgetExceeded } from '../../adapters/index.mjs';
import { KICKOFF, REMINDER, TOOLS, systemFor } from './prompt.mjs';

export async function driveModel(sb, { nudge, params, agentId }) {
  const system = systemFor(nudge);
  const model = sb.model;
  await sb.note('system', { system, tools: TOOLS, settings: { max_tokens: params.maxTokens, temperature: params.temperature, effort: params.effort } });
  const messages = [{ role: 'user', text: KICKOFF }];
  await sb.note('user', { text: KICKOFF });
  let reminded = false;
  for (let turn = 0; turn < params.maxTurns; turn++) {
    if (!(await sb.timeLeft())) return sb.finish('deadline');
    let res;
    try {
      res = await callModel({ agentId: String(agentId), model, system, messages, tools: TOOLS, maxTokens: params.maxTokens,
        temperature: params.temperature, effort: params.effort, purpose: `round ${sb.seq} agent ${agentId} run ${sb.run}` });
    } catch (e) {
      await sb.note('meta', { error: e instanceof BudgetExceeded ? 'budget' : 'provider', status: e.status || null, message: String(e.message).slice(0, 400) });
      return sb.finish(e instanceof BudgetExceeded ? 'budget' : 'provider_error');
    }
    // the exact request body sent and the exact response body (CONTRACT §6; replay resends `request` as is)
    await sb.note('assistant', {
      request: res.request, response: res.raw, served_model: res.modelVersion, version_match: res.versionMatch,
      http_request_id: res.httpRequestId, usage: res.usage, usd: Number(res.usd.toFixed(6)),
    }, { requestId: res.requestId });
    messages.push({ role: 'assistant', native: res.message });
    if (res.stopReason === 'refusal') return sb.finish('refusal');
    if (!res.toolCalls.length) {
      if (reminded) return sb.finish('stopped');
      reminded = true;
      messages.push({ role: 'user', text: REMINDER });
      await sb.note('user', { text: REMINDER });
      continue;
    }
    const results = [];
    for (const tc of res.toolCalls) {
      const r = await sb.toolCall({ id: tc.id, name: tc.name, input: tc.input, requestId: res.requestId });
      results.push({ id: tc.id, nativeId: tc.nativeId, name: tc.name, content: JSON.stringify(r.output), isError: r.isError });
    }
    if (sb.ended) return sb.finish(sb.ended);
    messages.push({ role: 'tool', results });
  }
  return sb.finish('turn_limit');
}
