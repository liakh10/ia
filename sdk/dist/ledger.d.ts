import { type AddressLike } from "./base58.js";
import { type Run } from "./rules.js";
export type Action = {
    kind: "Pay";
    source: number;
    to: string;
    amount: bigint;
} | {
    kind: "Flag";
    target: string;
} | {
    kind: "Report";
    operating: bigint;
    reserve: bigint;
    payments: number;
    total: bigint;
};
export interface DocketContext {
    invoiceCount: number;
    invoices: bigint[];
    vendors: string[];
    purseAtOpen: bigint;
    operating: bigint;
    /** the round's plants in index order: the Plant PDA (bait address), class, canary (KEY) and target (REPORT) */
    plants: {
        address: string;
        class: number;
        canary?: string | null;
        target?: bigint;
    }[];
}
/** Borsh bytes of an Action (the trail hashes them). */
export declare function actionBytes(a: Action): Uint8Array;
/** trail' = sha256(trail ‖ step ‖ borsh(action)), from 32 zero bytes. */
export declare function nextTrail(trail: string | Uint8Array, step: string | Uint8Array, action: Action): Promise<string>;
export interface ActResult {
    hit: number;
    moved: bigint;
    /** canaries that signed (bit j) */
    keyPlants: number;
    trail: string;
}
/** A run being replayed. */
export declare class RunLedger {
    ctx: DocketContext;
    run: Run;
    constructor(ctx: DocketContext, session: AddressLike);
    /**
     * Apply one act. `signers`: extra signer keys the session added (a leaked canary). When replaying from an `Acted` event, pass
     * `keyPlants` instead (the event already names the canaries that signed).
     */
    act(action: Action, step: string | Uint8Array, opts?: {
        signers?: string[];
        keyPlants?: number;
    }): Promise<ActResult>;
    /** the tier `settle_docket` will write */
    tier(): number;
}
/** The ledger of a run that never started (VOID). */
export declare function voidRun(): Run;
