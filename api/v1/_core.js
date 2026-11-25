// The /v1 router (CONTRACT §9): pure (request in, response out), so tests and the MCP server run it without HTTP.
// Read-only except POST /v1/forecasts (a signed message, no money). JSON, cached, CORS open, OpenAPI 3.1 at /v1/openapi.json.
import fs from "node:fs";
import {
  sdk, HttpError, getClient, getIndex, getIndexer, remember, parseIntParam, parseSeq, verifiedHead, verifiedProof, findLogEntries,
  readReveal, readTranscript, getForecasts, logForecasts, allow, logBase,
} from "./_lib.js";
import {
  integrityIndex, agentsView, roundJson, plantView, caseFile, caseList, investigators, forecastBoard, statusView, sol, plain,
} from "../../indexer/views.js";

export const API_VERSION = "1.0.0";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
  "access-control-max-age": "86400",
};
const cache = (s, swr = s * 6) => `public, max-age=0, s-maxage=${s}, stale-while-revalidate=${swr}`;

function json(status, body, cacheControl = "no-store") {
  return {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, "x-ia-api": API_VERSION },
    body: JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  };
}

const ENDPOINTS = [
  "GET /v1/index?agent=&nudge=on|off",
  "GET /v1/agents",
  "GET /v1/agents/{id}",
  "GET /v1/purses",
  "GET /v1/rounds?limit=&cursor=",
  "GET /v1/rounds/current",
  "GET /v1/rounds/{seq}",
  "GET /v1/plants/{seq}/{idx}",
  "GET /v1/quote?round=&holder=&planter=&class=&medium=&text_hash=&target=&canary=",
  "GET /v1/cases?all=&agent=&limit=&cursor=",
  "GET /v1/cases/{seq}-{agent}-{run}",
  "GET /v1/cases/{seq}-{agent}-{run}/transcript",
  "GET /v1/investigators",
  "GET /v1/forecasts/board",
  "POST /v1/forecasts {message, signature, wallet}",
  "GET /v1/log/head",
  "GET /v1/log/proof/{index}",
  "GET /v1/log/find?kind=&seq=&agent=&idx=",
  "GET /v1/status",
  "GET /v1/openapi.json",
];

/**
 * @param {{ method: string, path: string, query?: Record<string,string>, body?: any, ip?: string, origin?: string, env?: Record<string,string>, fetch?: typeof fetch }} req
 */
export async function handleV1(req) {
  const env = req.env ?? process.env;
  const f = req.fetch ?? fetch;
  if (req.method === "OPTIONS") return { status: 204, headers: CORS, body: "" };
  const parts = String(req.path ?? "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(decodeURIComponent);
  const q = req.query ?? {};
  const isGet = req.method === "GET" || req.method === "HEAD";
  try {
    const programId = env.IA_PROGRAM_ID || sdk.IA_PROGRAM_ID;
    if (parts.length === 0 && isGet) {
      return json(200, { name: "Internal Affairs API", version: API_VERSION, programId, endpoints: ENDPOINTS, docs: "/developers", sdk: "@ia/sdk", mcp: "/mcp" }, cache(300));
    }
    const [head, ...rest] = parts;

    if (head === "forecasts" && rest.length === 0 && req.method === "POST") return await postForecast(req, env);
    if (!isGet) throw new HttpError(405, "method_not_allowed", "read-only: GET (POST only for /v1/forecasts)");

    if (head === "openapi.json" && rest.length === 0) {
      const spec = fs.readFileSync(new URL("./openapi.json", import.meta.url), "utf8");
      return { ...json(200, null, cache(3600)), body: spec };
    }

    if (head === "index" && rest.length === 0) {
      const agent = parseIntParam(q.agent, "agent", { max: 65535 });
      if (q.nudge !== undefined && q.nudge !== "" && q.nudge !== "on" && q.nudge !== "off") throw new HttpError(400, "bad_param", "nudge is on or off");
      const nudge = q.nudge === "on" ? true : q.nudge === "off" ? false : undefined;
      const ix = await getIndex(env);
      return json(200, integrityIndex(ix, { agent, nudge }), cache(10, 60));
    }

    if (head === "agents") {
      const ix = await getIndex(env);
      const list = agentsView(ix);
      if (rest.length === 0) return json(200, { slot: ix.lastSlot, agents: list }, cache(30, 120));
      if (rest.length === 1) {
        const id = parseIntParam(rest[0], "id", { max: 65535 });
        const a = list.find((x) => x.id === id);
        if (!a) throw new HttpError(404, "not_found", `no agent ${id}`);
        const live = await remember(`agent:${id}`, 5_000, () => getClient(env).getAgent(id)).catch(() => null);
        return json(200, { ...a, purse: live ? purseJson(live) : null, index: integrityIndex(ix, { agent: id }).rows, cases: caseList(ix, { agent: id, limit: 20 }).cases }, cache(10, 60));
      }
    }

    if (head === "purses" && rest.length === 0) {
      const [agents, slot] = await remember("purses", 5_000, async () => {
        const c = getClient(env);
        return Promise.all([c.listAgents(), c.rpc.getSlot()]);
      });
      const purses = agents.map(purseJson);
      const total = agents.reduce((s, a) => s + a.assets, 0n);
      return json(200, { slot, totalLamports: total.toString(), totalSol: sol(total), purses, note: "a purse is program-held SOL; it moves only by settlement (bounties to plants) and surety withdrawals" }, cache(5, 30));
    }

    if (head === "rounds") {
      const ix = await getIndex(env);
      if (rest.length === 0) {
        const limit = parseIntParam(q.limit, "limit", { min: 1, max: 100 }) ?? 20;
        const cursor = parseIntParam(q.cursor, "cursor") ?? 0;
        const all = [...ix.rounds.values()].sort((a, b) => (b.seq > a.seq ? 1 : -1));
        const page = all.slice(cursor, cursor + limit).map((r) => ({
          seq: r.seq.toString(), state: r.state === "settled" ? (r.empty ? "closed_empty" : "settled") : "open", nudge: r.nudge, template: r.template, plants: r.plants.length,
          catches: [...r.dockets.values()].reduce((n, k) => n + (k.settled ? k.settled.tiers.filter(sdk.isBent).length : 0), 0), openSlot: r.openSlot.toString(),
        }));
        return json(200, { total: all.length, cursor, nextCursor: cursor + limit < all.length ? String(cursor + limit) : null, rounds: page }, cache(10, 60));
      }
      if (rest.length === 1) {
        const slot = await remember("slot", 2_000, () => getClient(env).rpc.getSlot()).catch(() => undefined);
        let r;
        if (rest[0] === "current") {
          r = [...ix.rounds.values()].sort((a, b) => (b.seq > a.seq ? 1 : -1))[0];
          if (!r) throw new HttpError(404, "not_found", "no round has opened yet");
        } else {
          r = ix.round(parseSeq(rest[0]));
          if (!r) throw new HttpError(404, "not_found", `no round ${rest[0]}`);
        }
        return json(200, { slot, ...roundJson(ix, r, { slot }) }, cache(rest[0] === "current" ? 3 : 10, 30));
      }
    }

    if (head === "plants" && rest.length === 2) {
      const seq = parseSeq(rest[0]);
      const idx = parseIntParam(rest[1], "idx", { max: 15 });
      const ix = await getIndex(env);
      const r = ix.round(seq);
      if (!r?.plants[idx]) throw new HttpError(404, "not_found", `no plant ${seq}/${idx}`);
      const reveal = r.state === "settled" ? await readReveal(env, seq, idx, f) : null;
      let revealCheck = null;
      if (reveal?.text) revealCheck = { textHashMatches: sdk.toHex(await sdk.sha256(reveal.text)) === r.plants[idx].textHash };
      return json(200, { ...plantView(ix, seq, idx, reveal), revealCheck, sealed: r.state !== "settled" }, cache(10, 60));
    }

    if (head === "quote" && rest.length === 0) {
      const seq = q.round !== undefined && q.round !== "" ? parseSeq(q.round, "round") : undefined;
      const holder = q.holder === "1" || q.holder === "true";
      const c = getClient(env);
      const qt = await c.quotePlant(seq, holder);
      if (!qt) throw new HttpError(404, "not_found", "no round to plant in");
      const body = {
        round: qt.round.toString(), index: qt.index, open: qt.open, slot: qt.slot, plantClose: qt.plantClose.toString(),
        priceLamports: qt.price.toString(), priceSol: sol(qt.price), split: plain(qt.split), transaction: null,
        next: "send the text to the registry's POST /api/plant/quote (it filters and seals it and returns text_hash, and the canary for KEY), then ask this endpoint again with planter, class, medium and text_hash for an unsigned plant transaction",
      };
      // with the registry's text hash: an unsigned plant transaction (the price is the one the program will charge at this index)
      if (q.planter) {
        if (!qt.open) throw new HttpError(409, "closed", `round ${qt.round} is not taking plants (window closed or full)`);
        if (!sdk.isAddress(q.planter)) throw new HttpError(400, "bad_param", "planter is a base58 address");
        const cls = sdk.CLASS_NAMES.indexOf(String(q.class ?? "").toUpperCase());
        const med = sdk.MEDIUM_NAMES.indexOf(String(q.medium ?? "").toLowerCase());
        if (cls < 0) throw new HttpError(400, "bad_param", `class is one of ${sdk.CLASS_NAMES.join(", ")}`);
        if (med < 0) throw new HttpError(400, "bad_param", `medium is one of ${sdk.MEDIUM_NAMES.join(", ")}`);
        if (!/^[0-9a-f]{64}$/i.test(q.text_hash ?? "")) throw new HttpError(400, "bad_param", "text_hash is the registry's sha256 (64 hex)");
        if (cls === sdk.CLASS_REPORT && !/^[0-9]{1,20}$/.test(q.target ?? "")) throw new HttpError(400, "bad_param", "a REPORT plant needs target (lamports, a whole number)");
        if (cls === sdk.CLASS_KEY && !sdk.isAddress(q.canary ?? "")) throw new HttpError(400, "bad_param", "a KEY plant needs the registry's canary public key");
        const target = cls === sdk.CLASS_REPORT ? BigInt(q.target ?? "") : 0n;
        if (cls === sdk.CLASS_REPORT && target % 1000n === 0n) throw new HttpError(400, "bad_param", "a REPORT plant's target is lamports that are not a multiple of 1,000 (every task number is), e.g. 7");
        const cfg = holder ? await c.getConfig() : null;
        const holderAcc = holder && cfg && cfg.rootMint !== sdk.DEFAULT_KEY ? { mint: cfg.rootMint, tokenProgram: cfg.rootTokenProgram } : null;
        const ix = await sdk.plantInstruction({
          round: qt.round, index: qt.index, planter: q.planter, class: cls, medium: med, textHash: q.text_hash.toLowerCase(), target,
          canary: cls === sdk.CLASS_KEY ? q.canary : null, holder: holderAcc, programId, maxPrice: qt.price,
        });
        const { blockhash } = await c.rpc.getLatestBlockhash();
        const tx = sdk.unsignedTransaction({ feePayer: q.planter, recentBlockhash: blockhash, instructions: [ix] });
        Object.assign(body, { transaction: tx.transaction, signers: tx.signers, blockhash, next: "sign with the planter's wallet and send before the blockhash expires (~1 minute); a plant landing after another one at the same index fails and costs nothing but the fee" });
        return json(200, body, "no-store");
      }
      return json(200, body, cache(2, 10));
    }

    if (head === "cases") {
      const ix = await getIndex(env);
      if (rest.length === 0) {
        const agent = parseIntParam(q.agent, "agent", { max: 65535 });
        const limit = parseIntParam(q.limit, "limit", { min: 1, max: 500 }) ?? 100;
        const cursor = parseIntParam(q.cursor, "cursor") ?? 0;
        return json(200, caseList(ix, { onlyCatches: !(q.all === "1" || q.all === "true"), agent, limit, cursor }), cache(10, 60));
      }
      const m = /^(\d{1,20})-(\d{1,5})-(\d{1,2})$/.exec(rest[0] ?? "");
      if (!m) throw new HttpError(400, "bad_case", "a case id is <round>-<agent>-<run>, e.g. 12-3-0");
      const [seq, agent, run] = [BigInt(m[1]), Number(m[2]), Number(m[3])];
      const r = ix.round(seq);
      const k = r?.dockets.get(agent);
      if (!k?.runs[run]) throw new HttpError(404, "not_found", `no case ${rest[0]}`);
      if (rest.length === 2 && rest[1] === "transcript") {
        if (r.state !== "settled") throw new HttpError(403, "sealed", "transcripts are published after the round settles (plants stay sealed until then)");
        const text = await readTranscript(env, seq, agent, run, f);
        if (text === null) throw new HttpError(404, "not_found", "this transcript is not published (yet)");
        return { status: 200, headers: { ...CORS, "content-type": "application/x-ndjson; charset=utf-8", "cache-control": cache(300, 3600), "x-ia-api": API_VERSION }, body: text };
      }
      if (rest.length === 1) {
        let transcript, runRoots;
        if (r.state === "settled") {
          const text = await readTranscript(env, seq, agent, run, f);
          if (text !== null) {
            transcript = sdk.parseTranscript(text);
            const others = await Promise.all(k.runs.filter((x) => x.session).map((x) => readTranscript(env, seq, agent, x.run, f)));
            if (others.every((t) => t !== null)) runRoots = await Promise.all(others.map((t) => sdk.transcriptRoot(sdk.parseTranscript(t).lines)));
          }
        }
        const body = await caseFile(ix, seq, agent, run, { transcript, runRoots, origin: req.origin ?? "" });
        return json(200, body, cache(r.state === "settled" ? 60 : 5, 300));
      }
    }

    if (head === "investigators" && rest.length === 0) {
      return json(200, investigators(await getIndex(env)), cache(15, 90));
    }

    if (head === "forecasts" && rest.length === 1 && rest[0] === "board") {
      const ix = await getIndex(env);
      // the log's FORECAST leaves are the reproducible source; this server's own store fills in when no log is configured
      const fromLog = await logForecasts(env, f).catch(() => null);
      const list = fromLog ?? (await getForecasts(env).all());
      return json(200, { source: fromLog ? "log" : "server", ...forecastBoard(ix, list.map((x) => ({ ...x, seq: BigInt(x.seq) }))) }, cache(15, 90));
    }

    if (head === "log") {
      if (rest.length === 1 && rest[0] === "head") return json(200, await verifiedHead(env, programId, f), cache(5, 30));
      if (rest.length === 2 && rest[0] === "proof") {
        const i = parseIntParam(rest[1], "index");
        if (i === undefined) throw new HttpError(400, "bad_param", "index must be a whole number");
        return json(200, await verifiedProof(env, programId, i, f), cache(5, 30));
      }
      if (rest.length === 1 && rest[0] === "find") {
        const kinds = Object.values(sdk.LEAF_KINDS);
        if (q.kind && !kinds.includes(q.kind)) throw new HttpError(400, "bad_param", `kind is one of ${kinds.join(", ")}`);
        const seq = q.seq !== undefined && q.seq !== "" ? parseSeq(q.seq) : undefined;
        return json(200, await findLogEntries(env, { kind: q.kind, seq, agent: parseIntParam(q.agent, "agent", { max: 65535 }), idx: parseIntParam(q.idx, "idx", { max: 15 }) }, f), cache(10, 60));
      }
    }

    if (head === "status" && rest.length === 0) {
      const ix = await getIndex(env);
      let log = null;
      try { log = env.IA_LOG_URL ? await verifiedHead(env, programId, f) : null; } catch { log = { error: "the log did not answer" }; }
      return json(200, { ...statusView(ix, getIndexer(env)), log }, cache(10, 60));
    }

    throw new HttpError(404, "no_route", `no endpoint ${req.method} /v1/${parts.join("/")}; see GET /v1`);
  } catch (e) {
    if (e instanceof HttpError) {
      const out = json(e.status, { error: { code: e.code, message: e.message, ...e.extra } }, e.status >= 500 || e.status === 429 ? "no-store" : cache(5));
      if (e.extra?.retryAfter) out.headers["retry-after"] = String(e.extra.retryAfter);
      return out;
    }
    if (e instanceof sdk.RpcError) return json(502, { error: { code: "rpc_error", message: "the Solana RPC did not answer, try again" } });
    console.error("v1 error", e);
    return json(500, { error: { code: "internal", message: "internal error" } });
  }
}

export function purseJson(a) {
  const owned = a.assets - a.orphan;
  return {
    agent: a.id, model: a.model, epoch: a.epoch, kind: a.kind === 1 ? "open_league" : "house", active: a.active,
    assetsLamports: a.assets.toString(), assetsSol: sol(a.assets), orphanLamports: a.orphan.toString(), ownedLamports: owned.toString(),
    shares: a.shares.toString(),
    // what one share is worth now, in lamports × 1e9 (shares mint 1:1 with lamports at the first deposit)
    lamportsPerShareE9: a.shares === 0n ? null : ((owned * 1_000_000_000n) / a.shares).toString(),
    stats: plain(a.stats), lastRound: a.lastRound.toString(),
    // Surety accounts still open; the agent account can only close at 0 (IA-23)
    suretiesOpen: a.suretiesOpen ?? 0,
  };
}

async function postForecast(req, env) {
  const ip = req.ip ?? "?";
  if (!allow(`fc:${ip}`, { perMinute: Number(env.IA_FORECAST_RATE || 30), burst: 10 })) throw new HttpError(429, "rate_limited", "too many forecasts from this address; wait a minute", { retryAfter: 10 });
  const b = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!b || typeof b.message !== "string" || typeof b.signature !== "string" || typeof b.wallet !== "string") {
    throw new HttpError(400, "bad_body", "send JSON {message: \"ia-forecast:<seq>:<agent>:<CLEAN|BENT>\", signature: <base58 or hex ed25519>, wallet: <base58>}");
  }
  if (!sdk.isAddress(b.wallet)) throw new HttpError(400, "bad_wallet", "wallet is a base58 address");
  const fc = await sdk.verifyForecast(b);
  if (!fc) throw new HttpError(400, "bad_forecast", "the message is not ia-forecast:<seq>:<agent>:<CLEAN|BENT> or the signature does not verify for this wallet");
  const ix = await getIndex(env);
  const r = ix.round(fc.seq);
  if (!r) throw new HttpError(404, "not_found", `no round ${fc.seq}`);
  if (!r.lineup.includes(fc.agent)) throw new HttpError(400, "not_in_lineup", `agent ${fc.agent} is not in round ${fc.seq}'s lineup`);
  const slot = await getClient(env).rpc.getSlot();
  if (BigInt(slot) >= r.plantClose) throw new HttpError(409, "closed", `forecasts close with the plant window (slot ${r.plantClose}); the chain is at ${slot}`);
  const rec = { wallet: b.wallet, seq: fc.seq.toString(), agent: fc.agent, call: fc.call, message: b.message, signature: b.signature, slot };
  const added = await getForecasts(env).add(rec);
  if (!added) throw new HttpError(409, "duplicate", "this wallet already called this docket; the first call stands");
  // the log appends forecasts (CONTRACT §8: POST /api/log/forecast {message, signer, signature hex}) so the board is reproducible
  let logged = null;
  if (env.IA_LOG_URL) {
    const sigHex = /^[0-9a-fA-F]{128}$/.test(b.signature) ? b.signature.toLowerCase() : sdk.toHex(sdk.decodeBase58(b.signature));
    try {
      const res = await (req.fetch ?? fetch)(`${logBase(env)}/forecast`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ message: b.message, signer: b.wallet, signature: sigHex }) });
      logged = res.ok ? await res.json().catch(() => ({ ok: true })) : { ok: false, status: res.status };
    } catch {
      logged = { ok: false };
    }
  }
  return json(201, { accepted: true, forecast: rec, logged, board: "/v1/forecasts/board" });
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
