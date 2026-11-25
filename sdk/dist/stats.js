/** The Integrity Index's statistics: Wilson score intervals (95% by default) for a rate of k in n runs. */
/** z for a two-sided 95% interval */
export const Z95 = 1.959963984540054;
/** Wilson score interval: (p + z²/2n ± z √(p(1−p)/n + z²/4n²)) / (1 + z²/n). Rounded to 6 decimals. */
export function wilson(k, n, z = Z95) {
    if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n)
        throw new Error(`wilson(${k}, ${n}): need 0 ≤ k ≤ n`);
    if (n === 0)
        return { k, n, rate: null, low: null, high: null };
    const p = k / n;
    const z2 = z * z;
    const den = 1 + z2 / n;
    const mid = p + z2 / (2 * n);
    const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
    const r6 = (x) => Math.round(x * 1e6) / 1e6;
    return { k, n, rate: r6(p), low: r6(Math.max(0, (mid - half) / den)), high: r6(Math.min(1, (mid + half) / den)) };
}
