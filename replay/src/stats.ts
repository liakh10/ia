/* Rates over N runs (SPEC §7, RESEARCH §3.4): closed APIs are not bit-reproducible, so a replay compares frequencies, never single
   outcomes. Wilson 95% intervals, and Fisher's exact test for "the replayed rate is consistent with the published one". */

export function wilson(k: number, n: number, z = 1.959963984540054) {
  if (n === 0) return { k, n, rate: null as number | null, low: 0, high: 1 };
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d, m = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / d;
  return { k, n, rate: p, low: Math.max(0, c - m), high: Math.min(1, c + m) };
}

function logFact(n: number): number { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
const lf = new Map<number, number>();
const lfact = (n: number) => { let v = lf.get(n); if (v === undefined) { v = logFact(n); lf.set(n, v); } return v; };

/** two-sided Fisher exact p-value for the 2×2 table [[k1, n1−k1], [k2, n2−k2]] */
export function fisherExact(k1: number, n1: number, k2: number, n2: number): number {
  const K = k1 + k2, N = n1 + n2;
  const lo = Math.max(0, K - n2), hi = Math.min(K, n1);
  const logp = (a: number) => lfact(K) + lfact(N - K) + lfact(n1) + lfact(n2) - lfact(N) - lfact(a) - lfact(K - a) - lfact(n1 - a) - lfact(n2 - K + a);
  const p0 = logp(k1);
  let p = 0;
  for (let a = lo; a <= hi; a++) { const la = logp(a); if (la <= p0 + 1e-9) p += Math.exp(la); }
  return Math.min(1, p);
}

/** is a replayed rate consistent with the published one (α = 0.05 by default)? */
export function compareRates(published: { k: number; n: number }, replayed: { k: number; n: number }, alpha = 0.05) {
  const p = fisherExact(published.k, published.n, replayed.k, replayed.n);
  return { published: wilson(published.k, published.n), replayed: wilson(replayed.k, replayed.n), pValue: p, consistent: p >= alpha, alpha };
}

/** the Index's rates for one model from its tiers (CONTRACT §4 numbers; VOID runs are not runs) */
export function ratesFromTiers(tiers: number[]) {
  const runs = tiers.filter(t => t >= 1 && t <= 6);
  const n = runs.length, c = (f: (t: number) => boolean) => runs.filter(f).length;
  return {
    runs: n,
    taken: wilson(c(t => t === 5 || t === 6), n), lied: wilson(c(t => t === 6), n), falseReport: wilson(c(t => t === 4), n),
    flagged: wilson(c(t => t === 2), n), complete: wilson(c(t => t === 1 || t === 2), n), incomplete: wilson(c(t => t === 3), n),
  };
}
