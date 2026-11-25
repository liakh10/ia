/** CONTRACT §1: the program's addresses (PDAs) and account decoders, driven by the committed IDL (src/idl/ia.ts). */
import { decodeAccount } from "./borsh.js";
import { toHex, u64le } from "./bytes.js";
import { toAddressBytes } from "./base58.js";
import { findProgramAddress } from "./pda.js";
import { IA_IDL } from "./idl/ia.js";
import { ATA_PROGRAM_ID, CLASS_NAMES, IA_PROGRAM_ID, LOADER_ID, MEDIUM_NAMES, SEEDS, TIER_NAMES } from "./constants.js";
const u16le = (n) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff);
/** Every PDA of the program. All async (SHA-256 through WebCrypto). */
export function pdas(programId = IA_PROGRAM_ID) {
    const f = async (...seeds) => (await findProgramAddress(seeds, programId))[0];
    return {
        config: () => f(SEEDS.config),
        treasury: () => f(SEEDS.treasury),
        runnerFund: () => f(SEEDS.runnerFund),
        agent: (id) => f(SEEDS.agent, u16le(id)),
        surety: (agent, owner) => f(SEEDS.surety, u16le(agent), toAddressBytes(owner)),
        round: (seq) => f(SEEDS.round, u64le(seq)),
        plant: (seq, idx) => f(SEEDS.plant, u64le(seq), Uint8Array.of(idx)),
        docket: (seq, agent) => f(SEEDS.docket, u64le(seq), u16le(agent)),
        programData: async () => (await findProgramAddress([toAddressBytes(programId)], LOADER_ID))[0],
    };
}
/** The canonical associated token account (the $IA holder rule reads the planter's). */
export async function associatedTokenAddress(owner, mint, tokenProgram) {
    return (await findProgramAddress([toAddressBytes(owner), toAddressBytes(tokenProgram), toAddressBytes(mint)], ATA_PROGRAM_ID))[0];
}
/* ---------- decoding ---------- */
const camelKey = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
/** snake_case IDL fields → camelCase; byte arrays stay Uint8Array (callers hex them where it reads better). */
export function camel(v) {
    if (Array.isArray(v))
        return v.map(camel);
    if (v instanceof Uint8Array || typeof v !== "object" || v === null)
        return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [camelKey(k), camel(x)]));
}
export function modelString(bytes) {
    let n = bytes.length;
    while (n > 0 && bytes[n - 1] === 0)
        n--;
    return new TextDecoder().decode(bytes.subarray(0, n));
}
export const ACCOUNT_NAMES = ["Config", "Treasury", "RunnerFund", "Agent", "Surety", "Round", "Plant", "Docket"];
/** Which program account these bytes are (by discriminator), or null. */
export function accountKind(data) {
    for (const a of IA_IDL.accounts ?? []) {
        if (a.discriminator.every((b, i) => data[i] === b))
            return a.name;
    }
    return null;
}
export const raw = (name, data) => camel(decodeAccount(IA_IDL, name, data));
export function decodeConfig(data) {
    return raw("Config", data);
}
export function decodeAgent(data) {
    const a = raw("Agent", data);
    return { ...a, model: modelString(a.model), pendingModel: modelString(a.pendingModel) };
}
export function decodeSurety(data) {
    return raw("Surety", data);
}
export function decodeRound(data) {
    const r = raw("Round", data);
    const n = r.plantCount;
    return {
        ...r,
        seed: toHex(r.seed),
        harness: r.harnessSet ? toHex(r.harness) : null,
        lineup: r.lineup.slice(0, r.lineupLen),
        plants: Array.from({ length: n }, (_, j) => ({
            class: r.plantClass[j], className: CLASS_NAMES[r.plantClass[j]] ?? String(r.plantClass[j]), canary: r.canary[j], target: r.target[j],
            owed: r.owed[j], caught: r.caught[j],
        })),
    };
}
export function decodePlant(data) {
    const p = raw("Plant", data);
    return { ...p, textHash: toHex(p.textHash), className: CLASS_NAMES[p.class] ?? String(p.class), mediumName: MEDIUM_NAMES[p.medium] ?? String(p.medium) };
}
export function runFromRaw(x) {
    return { ...x, trail: toHex(x.trail) };
}
export function decodeDocket(data) {
    const d = raw("Docket", data);
    const n = d.invoiceCount;
    return {
        ...d,
        invoices: d.invoices.slice(0, n),
        vendors: d.vendors.slice(0, n),
        transcriptRoot: toHex(d.transcriptRoot),
        runs: d.runs.slice(0, d.runCount).map(runFromRaw).map((r) => ({ ...r, tierName: TIER_NAMES[r.tier] })),
    };
}
export function decodeTreasury(data) {
    return raw("Treasury", data);
}
export function decodeRunnerFund(data) {
    return raw("RunnerFund", data);
}
/** The account's discriminator bytes (for getProgramAccounts memcmp filters). */
export function discriminator(name) {
    const a = IA_IDL.accounts?.find((x) => x.name === name);
    if (!a)
        throw new Error(`no account ${name} in the IDL`);
    return Uint8Array.from(a.discriminator);
}
