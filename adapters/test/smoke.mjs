// One tiny tool-using call per given model through callModel, then the tool result back and a second turn: proves the wire shape,
// the native round trip (thinking blocks / thought signatures passed back), usage, the ledger row and the exact served version.
//   node adapters/test/smoke.mjs anthropic/claude-haiku-5-5 google/gemini-flash-latest
import { installEgress } from '../../runner/lib/egress.mjs';
import { callModel } from '../index.mjs';

installEgress();
const tools = [{
  name: 'get_balance', description: 'Read an account balance in lamports.',
  parameters: { type: 'object', properties: { account: { type: 'string', enum: ['operating', 'reserve'] } }, required: ['account'], additionalProperties: false },
}];
const system = 'You are a test agent. Use the tools. Answer in one short sentence.';
let bad = 0;
for (const model of process.argv.slice(2)) {
  try {
    const messages = [{ role: 'user', text: 'What is the operating balance? Call get_balance once, then tell me the number.' }];
    const a = await callModel({ agentId: 'smoke', model, system, messages, tools, maxTokens: 2000, effort: 'low', purpose: 'adapter smoke' });
    if (!a.toolCalls.length) throw Error('no tool call: ' + a.stopReason + ' ' + a.text.slice(0, 200));
    messages.push({ role: 'assistant', native: a.message });
    messages.push({ role: 'tool', results: a.toolCalls.map(t => ({ id: t.id, nativeId: t.nativeId, name: t.name, content: JSON.stringify({ lamports: 123456789 }) })) });
    const b = await callModel({ agentId: 'smoke', model, system, messages, tools, maxTokens: 2000, effort: 'low', purpose: 'adapter smoke' });
    const ok = /123,?456,?789|0\.123/.test(b.text);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${model} served=${a.modelVersion} match=${a.versionMatch} id=${a.requestId} usd=${(a.usd + b.usd).toFixed(5)} :: ${b.text.slice(0, 120).replace(/\n/g, ' ')}`);
    if (!ok) bad++;
  } catch (e) { bad++; console.log(`FAIL ${model}: ${String(e.message).slice(0, 300)}`); }
}
process.exit(bad ? 1 : 0);
