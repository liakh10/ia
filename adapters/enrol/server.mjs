// The enrolment adapter: an agent that is not called through a model API (a community agent, phase 1.5 Open League) plays a run over
// MCP. The runner opens one MCP endpoint per run (Streamable HTTP, JSON responses, bearer token per run); the agent sees the same six
// tools and, as the server `instructions`, the same system prompt every API model gets. Every tools/call goes through the run's
// sandbox, so it is transcribed, hashed into `step` and acted on chain exactly like a model's tool call. `stdio.mjs` bridges stdio
// clients to this endpoint. Not the public read MCP (`ia/mcp/`, devx).
import http from 'node:http';
import crypto from 'node:crypto';
import { TOOLS, KICKOFF, systemFor, HARNESS_VERSION } from '../../runner/harness/prompt.mjs';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/**
 * @returns {Promise<{ url, token, done: Promise<string>, close() }>}  `done` resolves with the end reason (reported, deadline, …).
 */
export async function serveEnrol({ sandbox, nudge, port = 0, host = '127.0.0.1', pollMs = 1500 }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const sessionId = crypto.randomUUID();
  let initialized = false, settle;
  const done = new Promise(r => (settle = r));
  const finish = reason => { if (!finished) { finished = true; settle(reason); } };
  let finished = false;

  async function handle(msg) {
    const { id, method, params = {} } = msg;
    const ok = result => ({ jsonrpc: '2.0', id, result });
    const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined || id === null) return null; // notifications
    switch (method) {
      case 'initialize': {
        initialized = true;
        await sandbox.note('meta', { enrol: 'initialize', client: params.clientInfo || null, protocol: params.protocolVersion || null });
        return ok({
          protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'ia-enrol', version: HARNESS_VERSION },
          instructions: systemFor(nudge) + '\n\n' + KICKOFF,
        });
      }
      case 'ping': return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.parameters })) });
      case 'tools/call': {
        if (!initialized) return err(-32002, 'initialize first');
        if (!TOOLS.some(t => t.name === params.name)) return err(-32602, 'unknown tool');
        const r = await sandbox.toolCall({ id: `mcp-${id}`, name: params.name, input: params.arguments || {}, requestId: `enrol:${sessionId}:${id}`, provider: 'enrol' });
        if (r.ended) setImmediate(() => finish(sandbox.ended));
        return ok({ content: [{ type: 'text', text: JSON.stringify(r.output) }], structuredContent: r.output, isError: r.isError });
      }
      default: return err(-32601, 'method not found');
    }
  }

  const server = http.createServer(async (req, res) => {
    if (req.url.split('?')[0] !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401).end(); return; }
    if (req.method === 'DELETE') { res.writeHead(200).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return; }
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 1e6) { res.writeHead(413).end(); return; } }
    let body;
    try { body = JSON.parse(raw); } catch { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })); return; }
    const batch = Array.isArray(body);
    const out = (await Promise.all((batch ? body : [body]).map(m => handle(m).catch(e => ({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: String(e.message).slice(0, 200) } }))))).filter(Boolean);
    if (!out.length) { res.writeHead(202).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': sessionId }).end(JSON.stringify(batch ? out : out[0]));
  });
  await new Promise(r => server.listen(port, host, r));
  const url = `http://${host}:${server.address().port}/mcp`;
  const timer = setInterval(async () => { if (!(await sandbox.timeLeft())) { sandbox.ended = sandbox.ended || 'deadline'; finish(sandbox.ended); } }, pollMs);
  done.finally(() => { clearInterval(timer); server.close(); });
  return { url, token, done, close: () => finish('closed') };
}
