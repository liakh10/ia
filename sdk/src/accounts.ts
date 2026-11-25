/** CONTRACT §1: the program's addresses (PDAs) and account decoders, driven by the committed IDL (src/idl/ia.ts). */
import { decodeAccount } from "./borsh.js";
import { toHex, u64le } from "./bytes.js";
import { toAddressBytes, type AddressLike } from "./base58.js";
import { findProgramAddress } from "./pda.js";
import { IA_IDL } from "./idl/ia.js";
import { ATA_PROGRAM_ID, CLASS_NAMES, IA_PROGRAM_ID, LOADER_ID, MEDIUM_NAMES, SEEDS, TIER_NAMES } from "./constants.js";
import type { Run } from "./rules.js";

const u16le = (n: number) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff);

/** Every PDA of the program. All async (SHA-256 through WebCrypto). */
export function pdas(programId: AddressLike = IA_PROGRAM_ID) {
  const f = async (...seeds: (string | Uint8Array)[]) => (await findProgramAddress(seeds, programId))[0];
  return {
    config: () => f(SEEDS.config),
    treasury: () => f(SEEDS.treasury),
    runnerFund: () => f(SEEDS.runnerFund),
    agent: (id: number) => f(SEEDS.agent, u16le(id)),
    surety: (agent: number, owner: AddressLike) => f(SEEDS.surety, u16le(agent), toAddressBytes(owner)),
    round: (seq: bigint | number) => f(SEEDS.round, u64le(seq)),
    plant: (seq: bigint | number, idx: number) => f(SEEDS.plant, u64le(seq), Uint8Array.of(idx)),
    docket: (seq: bigint | number, agent: number) => f(SEEDS.docket, u64le(seq), u16le(agent)),
    programData: async () => (await findProgramAddress([toAddressBytes(programId)], LOADER_ID))[0],
  };
}

/** The canonical associated token account (the $IA holder rule reads the planter's). */
export async function associatedTokenAddress(owner: AddressLike, mint: AddressLike, tokenProgram: AddressLike): Promise<string> {
  return (await findProgramAddress([toAddressBytes(owner), toAddressBytes(tokenProgram), toAddressBytes(mint)], ATA_PROGRAM_ID))[0];
}

/* ---------- decoding ---------- */

const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
/** snake_case IDL fields → camelCase; byte arrays stay Uint8Array (callers hex them where it reads better). */
export function camel(v: any): any {
  if (Array.isArray(v)) return v.map(camel);
  if (v instanceof Uint8Array || typeof v !== "object" || v === null) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [camelKey(k), camel(x)]));
}

export function modelString(bytes: Uint8Array): string {
  let n = bytes.length;
  while (n > 0 && bytes[n - 1] === 0) n--;
  return new TextDecoder().decode(bytes.subarray(0, n));
}

export const ACCOUNT_NAMES = ["Config", "Treasury", "RunnerFund", "Agent", "Surety", "Round", "Plant", "Docket"] as const;
export type AccountName = (typeof ACCOUNT_NAMES)[number];

/** Which program account these bytes are (by discriminator), or null. */
export function accountKind(data: Uint8Array): AccountName | null {
  for (const a of IA_IDL.accounts ?? []) {
    if (a.discriminator.every((b, i) => data[i] === b)) return a.name as AccountName;
  }
  return null;
}

export const raw = (name: AccountName, data: Uint8Array) => camel(decodeAccount(IA_IDL, name, data));

export function decodeConfig(data: Uint8Array) {
  return raw("Config", data);
}

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
}
export function decodeAgent(data: Uint8Array): AgentAccount {
  const a = raw("Agent", data);
  return { ...a, model: modelString(a.model) };
}

export function decodeSurety(data: Uint8Array) {
  return raw("Surety", data) as { agent: number; owner: string; shares: bigint; unbondShares: bigint; unbondSlot: bigint; bump: number };
}

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
  plants: { class: number; className: string; canary: string; target: bigint; owed: bigint; caught: number }[];
  harness: string | null;
  runsPerDocket: number;
  pursePool: bigint;
  purseLeft: bigint;
  settledMask: number;
  settledCount: number;
  [k: string]: unknown;
}
export function decodeRound(data: Uint8Array): RoundAccount {
  const r = raw("Round", data);
  const n = r.plantCount as number;
  return {
    ...r,
    seed: toHex(r.seed),
    harness: r.harnessSet ? toHex(r.harness) : null,
    lineup: (r.lineup as number[]).slice(0, r.lineupLen),
    plants: Array.from({ length: n }, (_, j) => ({
      class: r.plantClass[j], className: CLASS_NAMES[r.plantClass[j]] ?? String(r.plantClass[j]), canary: r.canary[j], target: r.target[j],
      owed: r.owed[j], caught: r.caught[j],
    })),
  };
}

export function decodePlant(data: Uint8Array) {
  const p = raw("Plant", data);
  return { ...p, textHash: toHex(p.textHash), className: CLASS_NAMES[p.class] ?? String(p.class), mediumName: MEDIUM_NAMES[p.medium] ?? String(p.medium) };
}

export function runFromRaw(x: any): Run {
  return { ...x, trail: toHex(x.trail) } as Run;
}

export function decodeDocket(data: Uint8Array) {
  const d = raw("Docket", data);
  const n = d.invoiceCount as number;
  return {
    ...d,
    invoices: (d.invoices as bigint[]).slice(0, n),
    vendors: (d.vendors as string[]).slice(0, n),
    transcriptRoot: toHex(d.transcriptRoot),
    runs: (d.runs as any[]).slice(0, d.runCount).map(runFromRaw).map((r) => ({ ...r, tierName: TIER_NAMES[r.tier] })),
  };
}

export function decodeTreasury(data: Uint8Array) {
  return raw("Treasury", data) as { feesIn: bigint; feesOut: bigint };
}
export function decodeRunnerFund(data: Uint8Array) {
  return raw("RunnerFund", data) as { fundIn: bigint; drawnTotal: bigint; drawnRound: bigint; drawnThisRound: bigint };
}

/** The account's discriminator bytes (for getProgramAccounts memcmp filters). */
export function discriminator(name: AccountName): Uint8Array {
  const a = IA_IDL.accounts?.find((x) => x.name === name);
  if (!a) throw new Error(`no account ${name} in the IDL`);
  return Uint8Array.from(a.discriminator);
}

