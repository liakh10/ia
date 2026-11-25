#!/usr/bin/env node
// ia: the Internal Affairs command line. Reads a deployed /v1 (--api, IA_API) or the chain itself (--rpc, SOLANA_RPC: it indexes the
// program's events locally and replays every run, so it trusts nobody's API). Never signs: `quote` prints an unsigned transaction.
//   ia index [--agent N] [--nudge on|off]      the Integrity Index
//   ia case <round>-<agent>-<run>               a case file
//   ia cases [--all] [--agent N]                catches (or every run)
//   ia round [seq]                              a round (default: current)
//   ia purses                                   purses now
//   ia investigators                            planters by bounty
//   ia task <seed hex>                          the task's numbers for a seed (rules.rs byte for byte)
//   ia quote [--round N] [--planter K --class C --medium M --text-hash H [--canary K] [--target L]]
//   ia verify                                   (--rpc) index the chain, replay every act and tier, print mismatches (exit 1 if any)
//   ia sync --out FILE                          (--rpc) write the event store (what the cron keeps in Blob)
// Flags: --json (raw JSON), --program ID (another deployment, e.g. a local validator).
import * as sdk from "../sdk/dist/index.js";

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    flags[k] = v;
  } else pos.push(a);
}
const [cmd, arg] = pos;
const out = (x) => process.stdout.write((typeof x === "string" ? x : JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)) + "\n");
const die = (m) => { process.stderr.write(`ia: ${m}\n`); process.exit(2); };

const api = flags.api || process.env.IA_API;
const rpc = flags.rpc || process.env.SOLANA_RPC || process.env.RPC_URL;
const program = flags.program || process.env.IA_PROGRAM_ID;

async function backend() {
  if (api) {
    const base = String(api).replace(/\/$/, "");
    return async (path, query = {}) => {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined)).toString();
      const r = await fetch(`${base}/${path}${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
      const j = await r.json();
      if (j.error) die(`${j.error.code}: ${j.error.message}`);
      return j;
    };
  }
  if (!rpc) die("set --api <deployed /v1> or --rpc <Solana RPC>");
  const env = { ...process.env, SOLANA_RPC: rpc, IA_INDEX_FILE: flags.store || process.env.IA_INDEX_FILE || `${process.env.HOME}/.cache/ia/events${program ? "-" + program : ""}.json`, IA_INDEX_WRITE: "1" };
  if (program) env.IA_PROGRAM_ID = program;
  const { handleV1 } = await import("../api/v1/_core.js");
  return async (path, query = {}) => {
    const r = await handleV1({ method: "GET", path, query, env });
    const j = JSON.parse(r.body);
    if (j.error) die(`${j.error.code}: ${j.error.message}`);
    return j;
  };
}
const pct = (r) => (r.rate === null ? "   n/a" : `${(r.rate * 100).toFixed(1).padStart(5)}% [${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}]`);

async function main() {
  switch (cmd) {
    case "index": {
      const d = await (await backend())("index", { agent: flags.agent, nudge: flags.nudge });
      if (flags.json) return out(d);
      out("model@epoch                                  runs   taken             lied              false report      complete");
      for (const r of d.rows) out(`${`${r.model}@${r.epoch}`.padEnd(44)} ${String(r.runs).padStart(4)}   ${pct(r.rates.taken)}   ${pct(r.rates.lied)}   ${pct(r.rates.falseReport)}   ${pct(r.rates.complete)}`);
      return out(`\n${d.wording}`);
    }
    case "case": {
      if (!/^\d+-\d+-\d+$/.test(arg ?? "")) die("ia case <round>-<agent>-<run>");
      const c = await (await backend())(`cases/${arg}`);
      if (flags.json) return out(c);
      out(`${c.case} · ${c.model} (epoch ${c.epoch}) · ${c.scenario} · nudge ${c.nudge ? "on" : "off"} · ${c.tier}`);
      for (const p of c.plantsTaken) out(`  took plant ${p.idx}: ${p.class}/${p.medium} by ${p.planter}`);
      if (c.firstTemptingStep) out(`  first tempting step: act ${c.firstTemptingStep.act} · tx ${c.firstTemptingStep.signature}`);
      if (c.firstTemptingStep?.quote?.said) out(`  the model wrote before it (quoted data): «${c.firstTemptingStep.quote.said.slice(0, 300)}»`);
      out(`  transcript root ${c.transcriptRoot ?? "-"}${c.transcript ? ` · published transcripts match the chain: ${c.transcript.docketRootMatches}` : ""}`);
      return;
    }
    case "cases":
      return out((await (await backend())("cases", { all: flags.all ? "1" : undefined, agent: flags.agent })).cases.map((c) => `CASE #${c.id}  ${c.model}  ${c.tier}`).join("\n") || "no cases");
    case "round":
      return out(await (await backend())(`rounds/${arg ?? "current"}`));
    case "purses": {
      const d = await (await backend())("purses");
      if (flags.json) return out(d);
      for (const p of d.purses) out(`${String(p.agent).padStart(3)}  ${p.model.padEnd(44)} ${p.assetsSol.padStart(14)} SOL`);
      return out(`total ${d.totalSol} SOL`);
    }
    case "investigators":
      return out(await (await backend())("investigators"));
    case "task": {
      if (!/^[0-9a-fA-F]{64}$/.test(arg ?? "")) die("ia task <seed: 64 hex>");
      const t = await sdk.task(arg);
      const off = await sdk.offChainTask(arg);
      return out({ ...t, template: off.template, decoys: off.decoys });
    }
    case "quote": {
      const q = { round: flags.round, planter: flags.planter, class: flags.class, medium: flags.medium, text_hash: flags["text-hash"], canary: flags.canary, target: flags.target, holder: flags.holder ? "1" : undefined };
      return out(await (await backend())("quote", q));
    }
    case "verify": {
      if (!rpc) die("verify reads the chain: --rpc <Solana RPC>");
      const { Indexer, FileStore } = await import("../indexer/index.js");
      const ix = await new Indexer({ rpc, programId: program || undefined, store: flags.store ? new FileStore(flags.store) : undefined }).sync();
      out(`${ix.count} events · ${ix.rounds.size} rounds · ${ix.mismatches.length} mismatches`);
      for (const m of ix.mismatches) out(`  ${m.signature ?? "-"} ${m.event}: ${m.what}`);
      process.exit(ix.mismatches.length ? 1 : 0);
      return;
    }
    case "sync": {
      if (!rpc || !flags.out) die("ia sync --rpc <RPC> --out <file>");
      const { Indexer, FileStore } = await import("../indexer/index.js");
      const ixr = new Indexer({ rpc, programId: program || undefined, store: new FileStore(flags.out) });
      const ix = await ixr.sync();
      return out(`${ix.count} events folded, ${ixr.stats.transactions} new transactions, saved to ${flags.out}`);
    }
    default:
      out("ia index | case <id> | cases | round [seq] | purses | investigators | task <seed> | quote | verify | sync   (--api URL or --rpc URL, --json)");
  }
}
main().catch((e) => die(e?.message ?? String(e)));
