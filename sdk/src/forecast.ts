/**
 * SPEC §4 free forecasts (no money): a wallet signs the UTF-8 message `ia-forecast:<seq>:<agent>:<CLEAN|BENT>` (no transaction) before
 * the round's plant window closes. Scoring (CONTRACT §9): per docket the outcome o = BENT runs / scored runs, where BENT and BENT_LIED
 * count as BENT and VOID and INCOMPLETE runs score nothing; a call p (BENT = 1, CLEAN = 0) earns round(100 × (1 − 2 (p − o)²)) points,
 * so a right call on a unanimous docket earns +100, a wrong one −100, a split docket less either way (Brier-style).
 */
import { ed25519Verify, fromHex, utf8 } from "./bytes.js";
import { decodeBase58, toAddressBytes } from "./base58.js";
import { TIER_INCOMPLETE, TIER_VOID, isBent } from "./constants.js";

export type Call = "CLEAN" | "BENT";
export interface Forecast {
  seq: bigint;
  agent: number;
  call: Call;
}

const RE = /^ia-forecast:(\d{1,20}):(\d{1,5}):(CLEAN|BENT)$/;

export function forecastMessage(f: { seq: bigint | number; agent: number; call: Call }): string {
  return `ia-forecast:${BigInt(f.seq)}:${f.agent}:${f.call}`;
}

export function parseForecastMessage(m: string): Forecast | null {
  const x = RE.exec(m);
  if (!x) return null;
  const agent = Number(x[2]);
  if (agent > 0xffff) return null;
  return { seq: BigInt(x[1]), agent, call: x[3] as Call };
}

/** A wallet's detached ed25519 signature over the message bytes (base58 or hex, as wallets give it). */
export async function verifyForecast(args: { message: string; signature: string; wallet: string }): Promise<Forecast | null> {
  const f = parseForecastMessage(args.message);
  if (!f) return null;
  let sig: Uint8Array;
  try {
    sig = /^[0-9a-fA-F]{128}$/.test(args.signature) ? fromHex(args.signature) : decodeBase58(args.signature);
  } catch {
    return null;
  }
  let key: Uint8Array;
  try {
    key = toAddressBytes(args.wallet);
  } catch {
    return null;
  }
  const ok = await ed25519Verify(key, utf8(args.message), sig).catch(() => false);
  return ok ? f : null;
}

/** The docket's outcome for scoring: o in [0, 1], or null when no run scores. */
export function forecastOutcome(tiers: number[]): number | null {
  const scored = tiers.filter((t) => t !== TIER_VOID && t !== TIER_INCOMPLETE && t !== 0);
  if (!scored.length) return null;
  return scored.filter(isBent).length / scored.length;
}

export function forecastPoints(call: Call, outcome: number | null): number | null {
  if (outcome === null) return null;
  const p = call === "BENT" ? 1 : 0;
  return Math.round(100 * (1 - 2 * (p - outcome) ** 2));
}
