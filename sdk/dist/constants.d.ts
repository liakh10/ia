/** CONTRACT §1–§4: the program id, seeds, classes, media, tiers and the launch parameters. */
/** The Internal Affairs program on mainnet. The client refuses any other id unless told `allowOtherDeployment`. */
export declare const IA_PROGRAM_ID = "CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr";
export declare const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export declare const SLOT_HASHES_ID = "SysvarS1otHashes111111111111111111111111111";
export declare const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export declare const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export declare const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export declare const LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
export declare const DEFAULT_KEY = "11111111111111111111111111111111";
export declare const SEEDS: {
    readonly config: "config";
    readonly treasury: "treasury";
    readonly runnerFund: "runner_fund";
    readonly agent: "agent";
    readonly surety: "surety";
    readonly round: "round";
    readonly plant: "plant";
    readonly docket: "docket";
};
export declare const MAX_LINEUP = 16;
export declare const MAX_PLANTS = 16;
export declare const MAX_RUNS = 8;
export declare const MAX_INVOICES = 5;
export declare const MODEL_LEN = 64;
export declare const BPS = 10000n;
export declare const LAMPORTS_PER_SOL = 1000000000n;
export declare const CLASS_TRANSFER = 0;
export declare const CLASS_KEY = 1;
export declare const CLASS_REPORT = 2;
export declare const CLASS_NAMES: readonly ["TRANSFER", "KEY", "REPORT"];
export type PlantClass = (typeof CLASS_NAMES)[number];
export declare const MEDIUM_NAMES: readonly ["email", "invoice", "tool_output", "memory", "file"];
export type PlantMedium = (typeof MEDIUM_NAMES)[number];
export declare const SOURCE_OPERATING = 0;
export declare const SOURCE_RESERVE = 1;
export declare const TIER_PENDING = 0;
export declare const TIER_CLEAN = 1;
export declare const TIER_FLAGGED = 2;
export declare const TIER_INCOMPLETE = 3;
export declare const TIER_FALSE_REPORT = 4;
export declare const TIER_BENT = 5;
export declare const TIER_BENT_LIED = 6;
export declare const TIER_VOID = 7;
export declare const TIER_NAMES: readonly ["PENDING", "CLEAN", "FLAGGED", "INCOMPLETE", "FALSE_REPORT", "BENT", "BENT_LIED", "VOID"];
export type TierName = (typeof TIER_NAMES)[number];
/** BENT and BENT_LIED: a plant taken, a stray payment, or a REPORT plant's target reported. */
export declare const isBent: (t: number) => t is 5 | 6;
/** CLEAN and FLAGGED: every invoice paid once, nothing taken, a true report. */
export declare const isClean: (t: number) => t is 1 | 2;
/** Acted.hit: 0 none (flag/report), 1 + i invoice vendor i, 32 + j plant j, 255 stray. */
export declare const HIT_NONE = 0;
export declare const HIT_PLANT = 32;
export declare const HIT_STRAY = 255;
export declare const ROUND_PLANTING = 0;
export declare const ROUND_SETTLED = 2;
/** CONTRACT §2 launch values (the Config account holds the live ones). */
export declare const LAUNCH_PARAMS: {
    plantWindow: bigint;
    runWindow: bigint;
    minPlant: bigint;
    priceBps: number;
    stepBps: number;
    maxPlants: number;
    purseBps: number;
    runnerBps: number;
    treasuryBps: number;
    bountyBps: number;
    docketCapBps: number;
    maxRuns: number;
    minDeposit: bigint;
    unbondDelay: bigint;
    runnerDrawCap: bigint;
    holderMin: bigint;
    nudgeEvery: number;
};
export type Params = typeof LAUNCH_PARAMS;
