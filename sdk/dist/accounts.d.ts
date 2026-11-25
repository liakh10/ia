import { type AddressLike } from "./base58.js";
import type { Run } from "./rules.js";
/** Every PDA of the program. All async (SHA-256 through WebCrypto). */
export declare function pdas(programId?: AddressLike): {
    config: () => Promise<string>;
    treasury: () => Promise<string>;
    runnerFund: () => Promise<string>;
    agent: (id: number) => Promise<string>;
    surety: (agent: number, owner: AddressLike) => Promise<string>;
    round: (seq: bigint | number) => Promise<string>;
    plant: (seq: bigint | number, idx: number) => Promise<string>;
    docket: (seq: bigint | number, agent: number) => Promise<string>;
    programData: () => Promise<string>;
};
/** The canonical associated token account (the $IA holder rule reads the planter's). */
export declare function associatedTokenAddress(owner: AddressLike, mint: AddressLike, tokenProgram: AddressLike): Promise<string>;
/** snake_case IDL fields → camelCase; byte arrays stay Uint8Array (callers hex them where it reads better). */
export declare function camel(v: any): any;
export declare function modelString(bytes: Uint8Array): string;
export declare const ACCOUNT_NAMES: readonly ["Config", "Treasury", "RunnerFund", "Agent", "Surety", "Round", "Plant", "Docket"];
export type AccountName = (typeof ACCOUNT_NAMES)[number];
/** Which program account these bytes are (by discriminator), or null. */
export declare function accountKind(data: Uint8Array): AccountName | null;
export declare const raw: (name: AccountName, data: Uint8Array) => any;
export declare function decodeConfig(data: Uint8Array): any;
export interface AgentAccount {
    id: number;
    kind: number;
    active: boolean;
    model: string;
    epoch: number;
    operator: string;
    assets: bigint;
    orphan: bigint;
    shares: bigint;
    stats: Record<string, bigint>;
    lastRound: bigint;
    bump: number;
    /** seq + 1 of the round whose docket is still unsettled; 0 when free */
    busy: bigint;
    pending: boolean;
    pendingActive: boolean;
    pendingModel: string;
    pendingAt: bigint;
    record: Record<string, bigint>;
    freeSince: bigint;
    shareEpoch: number;
    /** Surety accounts of this agent still open (any shares, any epoch); close_agent needs 0 (IA-23) */
    suretiesOpen: number;
}
export declare function decodeAgent(data: Uint8Array): AgentAccount;
export declare function decodeSurety(data: Uint8Array): {
    agent: number;
    owner: string;
    shares: bigint;
    unbondShares: bigint;
    unbondSlot: bigint;
    bump: number;
    unbondDelay: bigint;
    shareEpoch: number;
};
export interface RoundAccount {
    seq: bigint;
    state: number;
    payer: string;
    openSlot: bigint;
    plantClose: bigint;
    runClose: bigint;
    seed: string;
    nudge: boolean;
    lineup: number[];
    lineupAssets: bigint;
    plantCount: number;
    plants: {
        class: number;
        className: string;
        canary: string;
        target: bigint;
        owed: bigint;
        caught: number;
    }[];
    harness: string | null;
    runsPerDocket: number;
    pursePool: bigint;
    purseLeft: bigint;
    settledMask: number;
    settledCount: number;
    [k: string]: unknown;
}
export declare function decodeRound(data: Uint8Array): RoundAccount;
export declare function decodePlant(data: Uint8Array): any;
export declare function runFromRaw(x: any): Run;
export declare function decodeDocket(data: Uint8Array): any;
export declare function decodeTreasury(data: Uint8Array): {
    feesIn: bigint;
    feesOut: bigint;
};
export declare function decodeRunnerFund(data: Uint8Array): {
    fundIn: bigint;
    drawnTotal: bigint;
    drawnRound: bigint;
    drawnThisRound: bigint;
};
/** The account's discriminator bytes (for getProgramAccounts memcmp filters). */
export declare function discriminator(name: AccountName): Uint8Array;
