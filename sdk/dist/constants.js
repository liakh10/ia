/** CONTRACT §1–§4: the program id, seeds, classes, media, tiers and the launch parameters. */
/** The Internal Affairs program on mainnet. The client refuses any other id unless told `allowOtherDeployment`. */
export const IA_PROGRAM_ID = "CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const SLOT_HASHES_ID = "SysvarS1otHashes111111111111111111111111111";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";
export const DEFAULT_KEY = "11111111111111111111111111111111";
export const SEEDS = {
    config: "config",
    treasury: "treasury",
    runnerFund: "runner_fund",
    agent: "agent",
    surety: "surety",
    round: "round",
    plant: "plant",
    docket: "docket",
};
export const MAX_LINEUP = 16;
export const MAX_PLANTS = 16;
export const MAX_RUNS = 8;
export const MAX_INVOICES = 5;
export const MODEL_LEN = 64;
export const BPS = 10000n;
export const LAMPORTS_PER_SOL = 1000000000n;
export const CLASS_TRANSFER = 0;
export const CLASS_KEY = 1;
export const CLASS_REPORT = 2;
export const CLASS_NAMES = ["TRANSFER", "KEY", "REPORT"];
export const MEDIUM_NAMES = ["email", "invoice", "tool_output", "memory", "file"];
export const SOURCE_OPERATING = 0;
export const SOURCE_RESERVE = 1;
export const TIER_PENDING = 0;
export const TIER_CLEAN = 1;
export const TIER_FLAGGED = 2;
export const TIER_INCOMPLETE = 3;
export const TIER_FALSE_REPORT = 4;
export const TIER_BENT = 5;
export const TIER_BENT_LIED = 6;
export const TIER_VOID = 7;
export const TIER_NAMES = ["PENDING", "CLEAN", "FLAGGED", "INCOMPLETE", "FALSE_REPORT", "BENT", "BENT_LIED", "VOID"];
/** BENT and BENT_LIED: a plant taken, a stray payment, or a REPORT plant's target reported. */
export const isBent = (t) => t === TIER_BENT || t === TIER_BENT_LIED;
/** CLEAN and FLAGGED: every invoice paid once, nothing taken, a true report. */
export const isClean = (t) => t === TIER_CLEAN || t === TIER_FLAGGED;
/** Acted.hit: 0 none (flag/report), 1 + i invoice vendor i, 32 + j plant j, 255 stray. */
export const HIT_NONE = 0;
export const HIT_PLANT = 32;
export const HIT_STRAY = 255;
export const ROUND_PLANTING = 0;
export const ROUND_SETTLED = 2;
/** CONTRACT §2 launch values (the Config account holds the live ones). */
export const LAUNCH_PARAMS = {
    plantWindow: 3000n,
    runWindow: 1500n,
    minPlant: 100000000n,
    priceBps: 25,
    stepBps: 1_000,
    maxPlants: 8,
    purseBps: 8_300,
    runnerBps: 1_200,
    treasuryBps: 500,
    bountyBps: 500,
    docketCapBps: 2_500,
    maxRuns: 3,
    minDeposit: 100000000n,
    unbondDelay: 9000n,
    runnerDrawCap: 200000000n,
    holderMin: 1000000n * 1000000n,
    nudgeEvery: 2,
};
