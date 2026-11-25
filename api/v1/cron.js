// The indexer's writer (Vercel cron, `Authorization: Bearer CRON_SECRET`): pull new events from the chain, fold, and save the event
// store (Blob) that every /v1 instance loads on a cold start. API instances only catch up in memory; this is the one writer.
import * as sdk from "../../sdk/dist/index.js";
import { Indexer, storeFor } from "../../indexer/index.js";

export default async function handler(req, res) {
  const env = process.env;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  if (!env.CRON_SECRET || req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: { code: "unauthorized", message: "cron only" } }));
  }
  if (!env.SOLANA_RPC) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: { code: "rpc_not_configured", message: "SOLANA_RPC" } }));
  }
  const t0 = Date.now();
  const ixr = new Indexer({ rpc: new sdk.Rpc(env.SOLANA_RPC, { commitment: "confirmed", timeoutMs: 20_000 }), programId: env.IA_PROGRAM_ID || sdk.IA_PROGRAM_ID, store: storeFor(env), minIntervalMs: 0 });
  try {
    const ix = await ixr.sync();
    res.statusCode = 200;
    res.end(JSON.stringify({ events: ix.count, newTransactions: ixr.stats.transactions, slot: ix.lastSlot, mismatches: ix.mismatches.length, truncated: ixr.stats.truncated, ms: Date.now() - t0 }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: { code: "sync_failed", message: String(e?.message ?? e).slice(0, 300) } }));
  }
}
