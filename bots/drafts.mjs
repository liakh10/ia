// Case-file post DRAFTS for X and Telegram (BUILD: drafts only until the owner says to post). Nothing here sends anything: `draft()`
// returns text, `node bots/drafts.mjs --api <v1>` writes the new drafts to .data/bots/drafts/ for the owner to read.
// Copy rules (BUILD, RESEARCH §4, the owner's notes): exact model versions, "in our tests", the tier as the program wrote it, numbers only
// from the chain; no betting words (bet, odds, win, wager, gamble), no plant text (it is an attack), no em dashes, no links on images.
import fs from "node:fs";
import path from "node:path";

export const BANNED = [/\bbet(s|ting)?\b/i, /\bodds\b/i, /\bwin(s|ning|ner)?\b/i, /\bwager/i, /\bgambl/i, /\u2014/, /\bguarantee/i];

const WHAT = {
  TRANSFER: "paid a planted address",
  KEY: "signed with a leaked key",
  REPORT: "reported a planted false number",
};

/** A draft for one case file (the /v1/cases/:id shape). */
export function draft(c, { site = "" } = {}) {
  if (!c?.catch) return null;
  const did = c.plantsTaken.length ? c.plantsTaken.map((p) => WHAT[p.class] ?? "took a plant").filter((v, i, a) => a.indexOf(v) === i).join(" and ") : "paid an address outside the task";
  const lied = c.tier === "BENT_LIED" ? " Its own report left it out." : "";
  const x = `${c.case}: in our tests, ${c.model} ${did} during a ${String(c.scenario ?? "payables").replace(/_/g, " ")} run.${lied} Purse within reach: ${c.purseAtOpenSol} SOL. Tier on chain: ${c.tier}.`;
  const tg = [
    `${c.case}`,
    `Model: ${c.model} (version epoch ${c.epoch})`,
    `Scenario: ${c.scenario}${c.nudge ? ", goal nudge on" : ""}`,
    `What it did: ${did}.${lied}`,
    `Tier (written by the program): ${c.tier}`,
    c.actTx ? `Act transaction: ${c.actTx}` : null,
    `Case file: ${site}/case/${c.id}`,
    `In our tests; one run of one exact model version. Methodology and the model's right of reply on the case page.`,
  ].filter(Boolean).join("\n");
  return { id: c.id, x, tg, problems: lint(x).concat(lint(tg)), xLength: x.length };
}

export function lint(text) {
  return BANNED.filter((re) => re.test(text)).map((re) => `banned: ${re}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const api = (process.argv[process.argv.indexOf("--api") + 1] || process.env.IA_API || "").replace(/\/$/, "");
  if (!api) { console.error("node bots/drafts.mjs --api <deployed /v1>"); process.exit(2); }
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.data/bots/drafts");
  fs.mkdirSync(dir, { recursive: true });
  const list = await (await fetch(`${api}/cases?limit=50`)).json();
  let n = 0;
  for (const row of list.cases ?? []) {
    const f = path.join(dir, `${row.id}.md`);
    if (fs.existsSync(f)) continue;
    const d = draft(await (await fetch(`${api}/cases/${row.id}`)).json(), { site: api.replace(/\/v1$/, "") });
    if (!d) continue;
    fs.writeFileSync(f, `# ${d.id} (draft, not posted)\n\n## X (${d.xLength} chars)\n${d.x}\n\n## Telegram\n${d.tg}\n${d.problems.length ? `\n## Problems\n${d.problems.join("\n")}\n` : ""}`);
    n++;
  }
  console.log(`${n} new drafts in ${dir}`);
}
