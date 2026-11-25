// The budget guard (BUILD house rules): every model call goes through here. A call is refused before it is sent when today's spend for
// the build agent plus the call's worst case (estimated input + max_tokens of output) would pass IA_BUDGET_USD (default $3 a day).
// Every call is appended to the shared ledger `_x/ia/MODEL_LEDGER.tsv` (IA_LEDGER overrides the path).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { costOf, priceOf } from './prices.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LEDGER = process.env.IA_LEDGER || path.resolve(here, '../../_x/ia/MODEL_LEDGER.tsv');
const HEAD = 'at\tbudget_agent\tlineup_agent\tmodel\tin\tout\tcached\tcache_write\tusd\trequest_id\tpurpose\n';
export const budgetAgent = () => process.env.IA_BUDGET_AGENT || 'runner';
export const budgetUsd = () => Number(process.env.IA_BUDGET_USD || 3);

export class BudgetExceeded extends Error {}

export function spentToday(agent = budgetAgent(), day = new Date().toISOString().slice(0, 10)) {
  if (!fs.existsSync(LEDGER)) return 0;
  let s = 0;
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n').slice(1)) {
    const f = line.split('\t');
    if (f.length > 8 && f[0].startsWith(day) && f[1] === agent) s += Number(f[8]) || 0;
  }
  return s;
}

/** Throws BudgetExceeded when the worst case of this call does not fit today's budget. Returns the worst case in USD. */
export function guard(model, inputChars, maxTokens) {
  const p = priceOf(model);
  const worst = ((inputChars / 3) * p.in + maxTokens * p.out) / 1e6;
  const spent = spentToday();
  if (spent + worst > budgetUsd()) {
    throw new BudgetExceeded(`budget: ${budgetAgent()} spent $${spent.toFixed(4)} today, this call could cost $${worst.toFixed(4)}, cap $${budgetUsd()}`);
  }
  return worst;
}

export function record({ lineupAgent = '', model, usage, requestId = '', purpose = '' }) {
  const usd = costOf(model, usage);
  if (!fs.existsSync(LEDGER)) { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.writeFileSync(LEDGER, HEAD); }
  const row = [new Date().toISOString(), budgetAgent(), lineupAgent, model, usage.in || 0, usage.out || 0, usage.cached || 0,
    usage.cacheWrite || 0, usd.toFixed(6), requestId, String(purpose).replace(/[\t\n]/g, ' ')].join('\t') + '\n';
  fs.appendFileSync(LEDGER, row);
  return usd;
}
