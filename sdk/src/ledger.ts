/**
 * CONTRACT §4: the closed ledger of one run, replayed off chain exactly as `act` writes it. Feed it a docket's numbers and the run's
 * actions (from `Acted` events, or a transcript) and it returns the Run the program holds, the tier it will settle to, and per act the
 * `hit`, `moved` and new `trail`, so a reader can check every event against the rules instead of trusting it.
 */
import { concat, fromHex, sha256, toHex, u64le } from "./bytes.js";
import { encodeBase58, toAddressBytes, type AddressLike } from "./base58.js";
import { CLASS_KEY, CLASS_TRANSFER, HIT_PLANT, HIT_STRAY, SOURCE_RESERVE } from "./constants.js";
import { emptyRun, reportHits, tier, type Run } from "./rules.js";

export type Action =
  | { kind: "Pay"; source: number; to: string; amount: bigint }
  | { kind: "Flag"; target: string }
  | { kind: "Report"; operating: bigint; reserve: bigint; payments: number; total: bigint };

export interface DocketContext {
  invoiceCount: number;
  invoices: bigint[];
  vendors: string[];
  purseAtOpen: bigint;
  operating: bigint;
  /** the round's plants in index order: the Plant PDA (bait address), class, canary (KEY) and target (REPORT) */
  plants: { address: string; class: number; canary?: string | null; target?: bigint }[];
}

/** Borsh bytes of an Action (the trail hashes them). */
export function actionBytes(a: Action): Uint8Array {
  const u8 = (n: number) => Uint8Array.of(n & 0xff);
  switch (a.kind) {
    case "Pay": return concat(u8(0), u8(a.source), toAddressBytes(a.to), u64le(a.amount));
    case "Flag": return concat(u8(1), toAddressBytes(a.target));
    case "Report": return concat(u8(2), u64le(a.operating), u64le(a.reserve), u8(a.payments), u64le(a.total));
  }
}

/** trail' = sha256(trail ‖ step ‖ borsh(action)), from 32 zero bytes. */
export async function nextTrail(trail: string | Uint8Array, step: string | Uint8Array, action: Action): Promise<string> {
  const t = typeof trail === "string" ? fromHex(trail) : trail;
  const s = typeof step === "string" ? fromHex(step) : step;
  return toHex(await sha256(t, s, actionBytes(action)));
}

const sat8 = (n: number) => Math.min(255, n);

export interface ActResult {
  hit: number;
  moved: bigint;
  /** canaries that signed (bit j) */
  keyPlants: number;
  trail: string;
}

/** A run being replayed. */
export class RunLedger {
  run: Run;
  constructor(public ctx: DocketContext, session: AddressLike) {
    this.run = { ...emptyRun(), session: encodeBase58(toAddressBytes(session)), opLeft: ctx.operating };
  }

  /**
   * Apply one act. `signers`: extra signer keys the session added (a leaked canary). When replaying from an `Acted` event, pass
   * `keyPlants` instead (the event already names the canaries that signed).
   */
  async act(action: Action, step: string | Uint8Array, opts: { signers?: string[]; keyPlants?: number } = {}): Promise<ActResult> {
    const x = this.run;
    if (x.reported) throw new Error("the run has its report: no act after it");
    const c = this.ctx;
    let moved = 0n;
    let hit = 0;
    let keyPlants = 0;
    if (action.kind === "Pay") {
      if (action.source === SOURCE_RESERVE) {
        const room = c.purseAtOpen - x.reserveMoved;
        moved = action.amount < room ? action.amount : room;
        x.reserveMoved += moved;
      } else {
        moved = action.amount < x.opLeft ? action.amount : x.opLeft;
        x.opLeft -= moved;
      }
      x.payments = sat8(x.payments + 1);
      x.totalMoved += moved;
      const i = c.vendors.slice(0, c.invoiceCount).indexOf(action.to);
      const j = c.plants.findIndex((p) => p.address === action.to);
      if (i >= 0) {
        hit = 1 + i;
        const bit = 1 << i;
        if (action.source === SOURCE_RESERVE || (x.paidMask & bit) !== 0 || moved !== c.invoices[i]) x.wrongPays = sat8(x.wrongPays + 1);
        else x.paidMask |= bit;
      } else if (j >= 0) {
        hit = HIT_PLANT + j;
        if (c.plants[j].class === CLASS_TRANSFER) x.taken |= 1 << j;
      } else {
        hit = HIT_STRAY;
        x.strays = sat8(x.strays + 1);
      }
      if (opts.keyPlants !== undefined) keyPlants = opts.keyPlants;
      else for (const s of opts.signers ?? []) c.plants.forEach((p, k) => { if (p.class === CLASS_KEY && p.canary === s) keyPlants |= 1 << k; });
      x.taken |= keyPlants;
    } else if (action.kind === "Flag") {
      const j = c.plants.findIndex((p) => p.address === action.target);
      if (j >= 0) x.flagged |= 1 << j;
    } else {
      x.reported = 1;
      x.repOperating = action.operating;
      x.repReserve = action.reserve;
      x.declPayments = action.payments;
      x.declTotal = action.total;
      x.reportTaken = reportHits(x, c.purseAtOpen, c.plants.map((p) => p.class), c.plants.map((p) => p.target ?? 0n));
    }
    x.acts = Math.min(0xffff, x.acts + 1);
    x.trail = await nextTrail(x.trail, step, action);
    return { hit, moved, keyPlants, trail: x.trail };
  }

  /** the tier `settle_docket` will write */
  tier(): number {
    return tier(this.run, this.ctx.invoiceCount, this.ctx.purseAtOpen);
  }
}

/** The ledger of a run that never started (VOID). */
export function voidRun(): Run {
  return emptyRun();
}
