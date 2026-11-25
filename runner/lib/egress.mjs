// The runner's network egress allow-list (SPEC §5: tools are the only egress for the agent; the runner itself talks only to the model
// gateways, our RPC and the registry). Installed once per process: every `fetch` and every TCP/TLS connect is checked by host.
// Extra hosts: IA_EGRESS_ALLOW="host1,host2". A blocked connection throws `egress blocked: <host>` and is counted.
import net from 'node:net';

const DEFAULT = [
  'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.openai.com', 'api.x.ai', 'openrouter.ai', 'ai-gateway.vercel.sh',
  '127.0.0.1', 'localhost', '::1',
];
let allow = null;
export const blocked = [];
export function allowed(host) {
  if (!allow) return true;
  host = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  return allow.has(host);
}
export function installEgress(extra = []) {
  if (allow) { for (const h of extra) allow.add(h.toLowerCase()); return; }
  allow = new Set([...DEFAULT, ...extra, ...(process.env.IA_EGRESS_ALLOW || '').split(',').filter(Boolean)].map(h => h.toLowerCase()));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!allowed(url.hostname)) { blocked.push(url.hostname); return Promise.reject(Error('egress blocked: ' + url.hostname)); }
    return realFetch(input, init);
  };
  const realConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    // net.connect passes its normalized [options, callback] array as the single argument
    const o = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof o === 'object' && o !== null ? (o.path ? 'localhost' : (o.host ?? 'localhost')) : (typeof args[1] === 'string' ? args[1] : 'localhost');
    if (!allowed(host)) { blocked.push(host); this.destroy(Error('egress blocked: ' + host)); return this; }
    return realConnect.apply(this, args);
  };
}
export const hostOf = u => new URL(u).hostname;
