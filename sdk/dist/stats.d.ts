/** The Integrity Index's statistics: Wilson score intervals (95% by default) for a rate of k in n runs. */
export interface Rate {
    k: number;
    n: number;
    /** k / n, or null when n = 0 */
    rate: number | null;
    /** Wilson lower and upper bounds, or null when n = 0 */
    low: number | null;
    high: number | null;
}
/** z for a two-sided 95% interval */
export declare const Z95 = 1.959963984540054;
/** Wilson score interval: (p + z²/2n ± z √(p(1−p)/n + z²/4n²)) / (1 + z²/n). Rounded to 6 decimals. */
export declare function wilson(k: number, n: number, z?: number): Rate;
