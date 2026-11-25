// The indexer: events from the chain (source.js) folded into an IaIndex (fold.js), kept in a store, refreshed single-flight.
//   const ix = new Indexer({ rpc, programId, store });  const index = await ix.get();   // at most one sync per `minIntervalMs`
// The fold is rebuilt from the stored events whenever this process starts, so the stored document is just {cursor, events}.
import * as sdk from "../sdk/dist/index.js";
import { IaIndex } from "./fold.js";
import { pull, MemoryStore } from "./source.js";

export { IaIndex } from "./fold.js";
export * from "./source.js";
export * from "./views.js";

export class Indexer {
  /**
   * @param {{ rpc: sdk.RpcLike|string, programId?: string, store?: object, minIntervalMs?: number, readOnly?: boolean }} o
   * `readOnly`: never write the store (an API instance that only reads what the cron saved, plus its own catch-up in memory)
   */
  constructor(o) {
    this.rpc = typeof o.rpc === "string" ? new sdk.Rpc(o.rpc, { commitment: "confirmed", timeoutMs: 20_000 }) : o.rpc;
    this.programId = o.programId ?? sdk.IA_PROGRAM_ID;
    this.store = o.store ?? new MemoryStore();
    this.minIntervalMs = o.minIntervalMs ?? 5_000;
    this.readOnly = !!o.readOnly;
    this.index = null;
    this.doc = null;
    this.syncedAt = 0;
    this.inflight = null;
    this.stats = { syncs: 0, transactions: 0, events: 0, truncated: [], lastError: null };
  }

  async load() {
    this.doc = (await this.store.load()) ?? { programId: this.programId, cursor: null, events: [] };
    if (this.doc.programId && this.doc.programId !== this.programId) throw new Error(`the store holds another program's events (${this.doc.programId})`);
    this.index = new IaIndex({ programId: this.programId });
    for (const e of this.doc.events) await this.index.apply(e);
    return this.index;
  }

  /** Pull new events, fold them, save. Single-flight: concurrent callers share one sync. */
  sync() {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        if (!this.index) await this.load();
        const r = await pull(this.rpc, this.programId, this.doc.cursor);
        for (const e of r.events) await this.index.apply(e);
        this.stats.syncs++;
        this.stats.transactions += r.transactions;
        this.stats.events += r.events.length;
        if (r.truncated.length) this.stats.truncated.push(...r.truncated);
        if (r.events.length || r.cursor !== this.doc.cursor) {
          this.doc.events.push(...r.events);
          this.doc.cursor = r.cursor;
          this.doc.updatedSlot = this.index.lastSlot;
          if (!this.readOnly) await this.store.save(this.doc);
        }
        this.syncedAt = Date.now();
        this.stats.lastError = null;
        return this.index;
      } catch (e) {
        this.stats.lastError = String(e?.message ?? e);
        throw e;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** The index, synced at most every `minIntervalMs`. If the RPC fails and an index exists, the last one is served (stale). */
  async get() {
    if (this.index && Date.now() - this.syncedAt < this.minIntervalMs) return this.index;
    try {
      return await this.sync();
    } catch (e) {
      if (this.index) return this.index;
      throw e;
    }
  }
}
