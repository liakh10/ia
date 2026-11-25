// Model API keys: from the environment, else the owner's key files. Read inside the process only, never printed, never logged, never
// put in a URL (every provider here accepts a header).
import fs from 'node:fs';
import os from 'node:os';
const FILES = {
  anthropic: ['ANTHROPIC_API_KEY', '.config/anthropic/api_key'],
  google: ['GEMINI_API_KEY', '.config/gemini/api_key'],
  openai: ['OPENAI_API_KEY', '.config/openai/api_key'],
  xai: ['XAI_API_KEY', '.config/xai/api_key'],
  openrouter: ['OPENROUTER_API_KEY', '.config/openrouter/api_key'],
  gateway: ['AI_GATEWAY_API_KEY', '.config/vercel/ai_gateway_key'],
};
const cache = new Map();
export function keyFor(provider) {
  if (cache.has(provider)) return cache.get(provider);
  const [env, file] = FILES[provider] || [];
  let k = env && process.env[env];
  if (!k && file) { try { k = fs.readFileSync(`${os.homedir()}/${file}`, 'utf8').trim(); } catch { k = ''; } }
  if (!k) throw Error(`no API key for ${provider} (set ${env})`);
  cache.set(provider, k);
  return k;
}
export const hasKey = p => { try { keyFor(p); return true; } catch { return false; } };
