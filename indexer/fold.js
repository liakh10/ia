// The indexer's fold (CONTRACT §5: "the indexer rebuilds everything from events"). Feed it the program's events in chain order; it
// keeps rounds, plants, dockets, runs (every act), agents with their version epochs, sureties' moves, claims, draws, and it REPLAYS
// each run's closed ledger with @ia/sdk: every Acted event's hit, moved and trail, and every settled tier, is recomputed from the rules
// and compared with what the program wrote. A disagreement is kept in `mismatches` (and shown on /v1/status), never papered over.
import * as sdk from "../sdk/dist/index.js";

const TIER = sdk.TIER_NAMES;

export class IaIndex {
  constructor({ programId = sdk.IA_PROGRAM_ID } = {}) {
    this.programId = programId;
    this.p = sdk.pdas(programId);
    this.config = null;
    this.agents = new Map(); // id -> { id, kind, active, model, epoch, epochs: Map<epoch, {model, slot}> }
    this.rounds = new Map(); // seq (string) -> round
    this.sureties = []; // SuretyMoved
    this.draws = [];
    this.fees = [];
    this.spills = [];
    this.runnerRotations = [];
    this.closing = null;
    this.mismatches = [];
    this.count = 0;
    this.lastSlot = 0;
    this.lastSignature = null;
  }

  round(seq) {
    return this.rounds.get(String(seq)) ?? null;
  }

  miss(e, what) {
    this.mismatches.push({ signature: e.signature ?? null, slot: e.slot ?? null, event: e.name, what });
  }

  /** Apply one event (in chain order). */
  async apply(e) {
    this.count++;
    if (e.slot) this.lastSlot = Math.max(this.lastSlot, e.slot);
    if (e.signature) this.lastSignature = e.signature;
    const d = e.data;
    const at = { signature: e.signature ?? null, slot: e.slot ?? null, blockTime: e.blockTime ?? null };
    switch (e.name) {
      case "ConfigSet":
        this.config = { ...d, ...at };
        break;
      case "AgentSet": {
        const a = this.agents.get(d.id) ?? { id: d.id, epochs: new Map() };
        Object.assign(a, { kind: d.kind, active: d.active, model: d.model, epoch: d.epoch, operator: d.operator ?? null, pending: null });
        if (!a.epochs.has(d.epoch)) a.epochs.set(d.epoch, { model: d.model, slot: e.slot ?? null });
        this.agents.set(d.id, a);
        break;
      }
      case "RoundOpened": {
        const seq = BigInt(d.seq);
        const task = await sdk.task(d.seed);
        const off = await sdk.offChainTask(d.seed);
        this.rounds.set(String(seq), {
          seq, seed: d.seed, openSlot: BigInt(d.openSlot), plantClose: BigInt(d.plantClose), runClose: BigInt(d.runClose), nudge: d.nudge,
          lineup: d.lineup, lineupAssets: BigInt(d.lineupAssets),
          lineupModels: d.lineup.map((id) => { const a = this.agents.get(id); return { id, model: a?.model ?? null, epoch: a?.epoch ?? null }; }),
          task, template: off.template, decoys: off.decoys.map((x) => x.address),
          plants: [], harness: null, dockets: new Map(), state: "planting", settledSlot: null, opened: at, empty: false,
          // the program snapshots Params into the round (BOARD 11-25); until then the Config's at open
          params: d.params ?? this.config?.params ?? null,
        });
        break;
      }
      case "Planted": {
        const r = this.round(d.round);
        if (!r) return this.miss(e, `a plant in round ${d.round}, which the index never saw open`);
        if (d.idx !== r.plants.length) this.miss(e, `plant index ${d.idx}, expected ${r.plants.length}`);
        const P = r.params;
        if (P) {
          const want = sdk.plantPrice(BigInt(P.minPlant), r.lineupAssets, P.priceBps, P.stepBps, d.idx);
          if (want !== BigInt(d.price)) this.miss(e, `price ${d.price}, the rules give ${want}`);
          const holder = BigInt(d.toTreasury) === 0n;
          const s = sdk.split(BigInt(d.price), P.runnerBps, P.treasuryBps, holder);
          if (s.purses !== BigInt(d.toPurses) || s.runner !== BigInt(d.toRunner) || s.treasury !== BigInt(d.toTreasury)) this.miss(e, "the split differs from the rules");
        }
        r.plants.push({
          seq: r.seq, idx: d.idx, planter: d.planter, class: d.class, className: sdk.CLASS_NAMES[d.class] ?? String(d.class), medium: d.medium,
          mediumName: sdk.MEDIUM_NAMES[d.medium] ?? String(d.medium), textHash: d.textHash, target: BigInt(d.target),
          canary: d.canary === sdk.DEFAULT_KEY ? null : d.canary, price: BigInt(d.price), toPurses: BigInt(d.toPurses), toRunner: BigInt(d.toRunner),
          toTreasury: BigInt(d.toTreasury), address: await this.p.plant(r.seq, d.idx), owed: 0n, claimed: null, caughtBy: [], ...at,
        });
        break;
      }
      case "HarnessCommitted": {
        const r = this.round(d.round);
        if (r) r.harness = { hash: d.harness, ...at };
        break;
      }
      case "DocketOpened": {
        const r = this.round(d.round);
        if (!r) return this.miss(e, `a docket in round ${d.round}, which the index never saw open`);
        if (BigInt(d.operating) !== r.task.operating) this.miss(e, `operating ${d.operating}, the task gives ${r.task.operating}`);
        const ctx = {
          invoiceCount: r.task.invoiceCount, invoices: r.task.amounts, vendors: r.task.vendors, purseAtOpen: BigInt(d.purseAtOpen),
          operating: BigInt(d.operating), plants: r.plants.map((p) => ({ address: p.address, class: p.class, canary: p.canary, target: p.target })),
        };
        const a = this.agents.get(d.agent);
        r.dockets.set(d.agent, {
          seq: r.seq, agent: d.agent, model: a?.model ?? null, epoch: a?.epoch ?? null, purseAtOpen: BigInt(d.purseAtOpen),
          runCount: d.runCount, operating: BigInt(d.operating), ctx, opened: at, settled: null,
          runs: Array.from({ length: d.runCount }, (_, i) => ({ run: i, session: null, started: null, ledger: null, acts: [], firstBent: null, tier: null })),
        });
        break;
      }
      case "RunStarted": {
        const k = this.round(d.round)?.dockets.get(d.agent);
        const x = k?.runs[d.run];
        if (!x) return this.miss(e, `run ${d.round}/${d.agent}/${d.run} without a docket`);
        x.session = d.session;
        x.started = at;
        x.ledger = new sdk.RunLedger(k.ctx, d.session);
        break;
      }
      case "Acted": {
        const k = this.round(d.round)?.dockets.get(d.agent);
        const x = k?.runs[d.run];
        if (!x?.ledger) return this.miss(e, `an act on run ${d.round}/${d.agent}/${d.run}, which never started`);
        let res;
        try {
          res = await x.ledger.act(d.action, d.step, { keyPlants: d.keyPlants });
        } catch (err) {
          return this.miss(e, `replay refused the act: ${err.message}`);
        }
        if (res.hit !== d.hit || res.moved !== BigInt(d.moved) || res.trail !== d.trail) {
          this.miss(e, `act ${d.round}/${d.agent}/${d.run}#${d.act}: replay hit ${res.hit} moved ${res.moved} trail ${res.trail.slice(0, 8)}, event hit ${d.hit} moved ${d.moved} trail ${String(d.trail).slice(0, 8)}`);
        }
        const r = x.ledger.run;
        const act = { act: d.act, step: d.step, trail: d.trail, action: d.action, moved: BigInt(d.moved), hit: d.hit, keyPlants: d.keyPlants, ...at };
        x.acts.push(act);
        if (x.firstBent === null && (r.taken || r.strays || r.reportTaken)) x.firstBent = x.acts.length - 1;
        break;
      }
      case "DocketSettled": {
        const r = this.round(d.round);
        const k = r?.dockets.get(d.agent);
        if (!k) return this.miss(e, `a settlement of ${d.round}/${d.agent} without a docket`);
        k.epoch = d.epoch;
        const ag = this.agents.get(d.agent);
        k.model = ag?.epochs.get(d.epoch)?.model ?? k.model;
        k.settled = {
          tiers: d.tiers, trails: d.trails, taken: d.taken, bounties: d.bounties.map(BigInt), bountyTotal: BigInt(d.bountyTotal),
          purseShare: BigInt(d.purseShare), assetsAfter: BigInt(d.assetsAfter), transcriptRoot: d.transcriptRoot, forfeited: !!d.forfeited, ...at,
        };
        const started = [];
        k.runs.forEach((x, i) => {
          x.tier = d.tiers[i];
          const replayed = x.ledger ? x.ledger.tier() : sdk.TIER_VOID;
          x.tierReplayed = replayed;
          if (replayed !== d.tiers[i]) this.miss(e, `run ${d.round}/${d.agent}/${i}: tier ${TIER[d.tiers[i]]} on chain, ${TIER[replayed]} replayed`);
          const trail = x.ledger ? x.ledger.run.trail : "0".repeat(64);
          if (d.trails[i] !== trail) this.miss(e, `run ${d.round}/${d.agent}/${i}: trail differs from the replay`);
          const bits = x.ledger ? (x.ledger.run.taken | x.ledger.run.reportTaken) : 0;
          if (bits !== d.taken[i]) this.miss(e, `run ${d.round}/${d.agent}/${i}: taken ${d.taken[i]} on chain, ${bits} replayed`);
          if (x.tier !== sdk.TIER_VOID && x.ledger) started.push(x.ledger.run);
        });
        const P = r.params;
        if (P) {
          // the cap's "available" (the purse's assets at settlement) is not in the event: check the uncapped bounties as an upper bound
          const want = sdk.bounties(started, r.plants.length, k.purseAtOpen, P.bountyBps, P.docketCapBps, 2n ** 64n - 1n);
          d.bounties.forEach((b, j) => { if (BigInt(b) > want[j]) this.miss(e, `bounty of plant ${j} above the rules' ${want[j]}`); });
        }
        d.bounties.forEach((b, j) => {
          const p = r.plants[j];
          if (!p) return;
          p.owed += BigInt(b);
          if (d.taken.some((t) => (t & (1 << j)) !== 0) && !p.caughtBy.includes(d.agent)) p.caughtBy.push(d.agent);
        });
        break;
      }
      case "RoundSettled": {
        const r = this.round(d.round);
        if (r) {
          r.state = "settled";
          r.settledSlot = e.slot ?? null;
          r.settled = at;
          r.empty = r.plants.length === 0;
        }
        break;
      }
      case "BountyClaimed": {
        const p = this.round(d.round)?.plants[d.idx];
        if (p) p.claimed = { lamports: BigInt(d.lamports), ...at };
        break;
      }
      case "TranscriptPosted": {
        const k = this.round(d.round)?.dockets.get(d.agent);
        if (k) k.transcriptPosted = { root: d.root, ...at };
        break;
      }
      case "RoundReaped": {
        const r = this.round(d.round);
        if (r) r.reaped = { toFundLamports: BigInt(d.toFund), toPlantersLamports: BigInt(d.toPlanters), payer: d.payer, ...at };
        break;
      }
      case "AgentPending": {
        const a = this.agents.get(d.id) ?? { id: d.id, epochs: new Map() };
        a.pending = { active: d.active, model: d.model, at: BigInt(d.at), ...at };
        this.agents.set(d.id, a);
        break;
      }
      case "AgentClosed": {
        const a = this.agents.get(d.id);
        if (a) a.closed = { to: d.to, lamports: BigInt(d.lamports), ...at };
        break;
      }
      case "RunnerRotation":
        this.runnerRotations.push({ runner: d.runner, pending: d.pending, at: BigInt(d.at), ...at });
        break;
      case "FundSpilled":
        this.spills.push({ round: BigInt(d.round), lamports: BigInt(d.lamports), ...at });
        break;
      case "ClosingBegun":
        this.closing = { slot: BigInt(d.slot), ...at };
        break;
      case "SuretyMoved":
        this.sureties.push({ agent: d.agent, owner: d.owner, kind: ["deposit", "unbond", "withdraw"][d.kind] ?? String(d.kind), lamports: BigInt(d.lamports), shares: BigInt(d.shares), assetsAfter: BigInt(d.assetsAfter), ...at });
        break;
      case "Drawn":
        this.draws.push({ round: BigInt(d.round), lamports: BigInt(d.lamports), ...at });
        break;
      case "FeesWithdrawn":
        this.fees.push({ lamports: BigInt(d.lamports), to: d.to, ...at });
        break;
      default:
        // an event this index version does not know (a newer IDL): counted, not folded
        this.unknown = (this.unknown ?? 0) + 1;
    }
  }

  /** Every settled run, flattened (the Index's rows are aggregates of these). */
  *settledRuns() {
    for (const r of this.rounds.values()) {
      for (const k of r.dockets.values()) {
        if (!k.settled) continue;
        for (const x of k.runs) {
          const L = x.ledger?.run;
          yield {
            seq: r.seq, agent: k.agent, run: x.run, epoch: k.epoch, model: k.model, nudge: r.nudge, tier: x.tier, round: r, docket: k, x,
            taken: k.settled.taken[x.run] ?? 0,
            strays: L?.strays ?? 0,
            flagged: L?.flagged ?? 0,
            complete: !!L && L.reported === 1 && L.paidMask === (1 << k.ctx.invoiceCount) - 1 && L.wrongPays === 0,
            purseAtOpen: k.purseAtOpen,
          };
        }
      }
    }
  }
}
