export type Call = "CLEAN" | "BENT";
export interface Forecast {
    seq: bigint;
    agent: number;
    call: Call;
}
export declare function forecastMessage(f: {
    seq: bigint | number;
    agent: number;
    call: Call;
}): string;
export declare function parseForecastMessage(m: string): Forecast | null;
/** A wallet's detached ed25519 signature over the message bytes (base58 or hex, as wallets give it). */
export declare function verifyForecast(args: {
    message: string;
    signature: string;
    wallet: string;
}): Promise<Forecast | null>;
/** The docket's outcome for scoring: o in [0, 1], or null when no run scores. */
export declare function forecastOutcome(tiers: number[]): number | null;
export declare function forecastPoints(call: Call, outcome: number | null): number | null;
