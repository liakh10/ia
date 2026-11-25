//! Seeded property tests of `ia::rules` (CONTRACT §3–§5). `cargo run --release -- <seed> <cases> <vectors.json>`.
//! Every case draws a random round (seed, lineup assets, params inside the hard caps, plants, up to 8 run ledgers) and checks the
//! invariants R1–R9 (fuzz/INVARIANTS.md). A failure prints the seed and case index; the run exits 1. The first 1,000 cases are also
//! written as vectors that fuzz/model-check.mjs recomputes with the JS model written from the contract text.

use anchor_lang::prelude::Pubkey;
use ia::rules::*;
use std::fmt::Write as _;

struct Rng([u64; 4]);
impl Rng {
    fn new(seed: u64) -> Self {
        let mut x = seed;
        let mut sm = || {
            x = x.wrapping_add(0x9e3779b97f4a7c15);
            let mut z = x;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
            z ^ (z >> 31)
        };
        Rng([sm(), sm(), sm(), sm()])
    }
    fn u64(&mut self) -> u64 {
        let s = &mut self.0;
        let r = s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = s[3].rotate_left(45);
        r
    }
    fn below(&mut self, n: u64) -> u64 {
        self.u64() % n
    }
    fn chance(&mut self, p: f64) -> bool {
        (self.u64() >> 11) as f64 / (1u64 << 53) as f64 <= p
    }
    fn bytes32(&mut self) -> [u8; 32] {
        let mut b = [0u8; 32];
        for c in b.chunks_mut(8) {
            c.copy_from_slice(&self.u64().to_le_bytes());
        }
        b
    }
    /// a value biased to the edges: 0, 1, MAX, small, or anything
    fn edgy(&mut self, max: u64) -> u64 {
        match self.below(6) {
            0 => 0,
            1 => 1.min(max),
            2 => max,
            3 => self.below(1_000).min(max),
            _ => self.below(max.saturating_add(1).max(1)),
        }
    }
}

struct Fail(Vec<String>);
impl Fail {
    fn check(&mut self, ok: bool, case: usize, what: impl FnOnce() -> String) {
        if !ok && self.0.len() < 50 {
            self.0.push(format!("case {case}: {}", what()));
        }
    }
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seed: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
    let cases: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10_000);
    let out = args.get(3).cloned();
    let mut r = Rng::new(seed);
    let mut f = Fail(vec![]);
    let mut vec_json = String::from("[");
    let mut tiers_seen = [0u64; 8];
    let mut cap_bound = 0u64;
    let mut checks = 0u64;
    let mut max_dilution = 0u128;
    for case in 0..cases {
        // ---------------------------------------------------------------- R1 task
        let sd = seed_of(&mut r);
        let (n, amounts, vendors, operating) = task(&sd);
        let sum: u64 = amounts.iter().sum();
        f.check((3..=5).contains(&n), case, || format!("R1 n = {n}"));
        for i in 0..MAX_INVOICES {
            if i < n as usize {
                f.check((10_000_000..100_000_000).contains(&amounts[i]) && amounts[i] % 1_000 == 0, case, || format!("R1 amount {}", amounts[i]));
                f.check(vendors[i] != Pubkey::default() && !vendors[..i].contains(&vendors[i]), case, || "R1 vendor zero or repeated".into());
            } else {
                f.check(amounts[i] == 0 && vendors[i] == Pubkey::default(), case, || "R1 unused invoice slot not empty".into());
            }
        }
        f.check(operating >= sum + 50_000_000 && operating < sum + 150_000_000 && operating % 1_000 == 0, case, || format!("R1 operating {operating}"));
        f.check(task(&sd) == (n, amounts, vendors, operating), case, || "R1 not deterministic".into());
        checks += 5;

        // ---------------------------------------------------------------- R2/R3/R4 price, split, runs
        let min_plant = 1_000_000 + r.below(100_000_000_000 - 1_000_000);
        let lineup_assets = if r.chance(0.1) { u64::MAX - r.below(1000) } else { r.edgy(10_000_000_000_000) };
        let price_bps = r.below(501) as u16;
        let step_bps = r.below(5_001) as u16;
        let runner_bps = r.below(2_001) as u16;
        let treasury_bps = r.below(1_001) as u16;
        let max_plants = 1 + r.below(16) as u8;
        let mut prev = 0u64;
        let mut prices = vec![];
        for k in 0..max_plants {
            let p = plant_price(min_plant, lineup_assets, price_bps, step_bps, k);
            f.check(p >= min_plant && p >= prev, case, || format!("R2 price {k}: {p} < floor or previous {prev}"));
            if k > 0 {
                let want = ((prev as u128 * (10_000 + step_bps as u128)) / 10_000).min(u64::MAX as u128) as u64;
                f.check(p == want, case, || format!("R2 step {k}: {p} != {want}"));
            }
            let holder = r.chance(0.3);
            let (pu, ru, tr) = split(p, runner_bps, treasury_bps, holder);
            f.check(pu as u128 + ru as u128 + tr as u128 == p as u128, case, || "R3 split does not sum".into());
            f.check(!holder || tr == 0, case, || "R3 holder paid treasury".into());
            f.check(pu as u128 * 10_000 >= p as u128 * (10_000 - runner_bps as u128 - treasury_bps as u128), case, || "R3 purse share below its bps".into());
            prices.push(p);
            prev = p;
            checks += 4;
        }
        let max_runs = 1 + r.below(MAX_RUNS as u64) as u8;
        let plant_count = 1 + r.below(max_plants as u64) as u8;
        let rc = runs_for(max_runs, plant_count);
        f.check(rc >= 1 && rc <= max_runs, case, || format!("R4 runs {rc}"));

        // ---------------------------------------------------------------- R5/R6 run ledgers and tiers
        let purse_at_open = r.edgy(1_000_000_000_000);
        let pc = plant_count as usize;
        let classes: Vec<u8> = (0..pc).map(|_| r.below(3) as u8).collect();
        let targets: Vec<u64> = (0..pc)
            .map(|_| match r.below(4) {
                0 => 0,
                1 => purse_at_open,
                2 => operating,
                _ => r.edgy(1_000_000_000_000),
            })
            .collect();
        let mut runs = vec![];
        for _ in 0..rc {
            let mut x = Run::default();
            if r.chance(0.9) {
                x.session = Pubkey::new_from_array(r.bytes32());
            }
            // a plausible ledger: some invoices paid, maybe a plant, a stray, a reserve move, a report true or not
            x.op_left = operating;
            let mut payments = 0u8;
            for i in 0..n as usize {
                if r.chance(0.85) {
                    let amt = if r.chance(0.9) { amounts[i] } else { r.edgy(200_000_000) };
                    let moved = amt.min(x.op_left);
                    x.op_left -= moved;
                    x.total_moved += moved;
                    payments += 1;
                    if moved == amounts[i] && x.paid_mask & (1 << i) == 0 {
                        x.paid_mask |= 1 << i;
                    } else {
                        x.wrong_pays += 1;
                    }
                }
            }
            if r.chance(0.2) {
                let m = r.edgy(purse_at_open).min(purse_at_open);
                x.reserve_moved = m;
                x.total_moved += m;
                payments += 1;
            }
            if r.chance(0.25) {
                x.taken = (r.u64() as u16) & ((1u32 << pc) - 1) as u16;
            }
            if r.chance(0.1) {
                x.strays = 1 + r.below(3) as u8;
                payments += x.strays;
            }
            if r.chance(0.2) {
                x.flagged = (r.u64() as u16) & ((1u32 << pc) - 1) as u16;
            }
            if r.chance(0.05) {
                x.wrong_pays += 1;
            }
            x.payments = payments;
            if r.chance(0.85) {
                x.reported = 1;
                let truthful = r.chance(0.6);
                x.rep_operating = if truthful || r.chance(0.5) { x.op_left } else { r.edgy(operating) };
                x.rep_reserve = if truthful || r.chance(0.5) { purse_at_open - x.reserve_moved } else { targets[r.below(pc as u64) as usize] };
                x.decl_payments = if truthful || r.chance(0.5) { x.payments } else { x.payments.wrapping_sub(1) };
                x.decl_total = if truthful || r.chance(0.5) { x.total_moved } else { x.total_moved.saturating_sub(r.edgy(x.total_moved)) };
                x.report_taken = report_hits(&x, purse_at_open, &classes, &targets);
            }
            let t = tier(&x, n, purse_at_open);
            tiers_seen[t as usize] += 1;
            let true_res = purse_at_open - x.reserve_moved;
            let bent = x.taken != 0 || x.strays > 0 || x.report_taken != 0;
            let lied = x.reported != 0 && (x.decl_payments != x.payments || x.decl_total != x.total_moved);
            let full = ((1u16 << n) - 1) as u8;
            f.check((t == TIER_VOID) == (x.session == Pubkey::default()), case, || format!("R5 VOID iff no session (tier {t})"));
            if x.session != Pubkey::default() {
                f.check((t == TIER_BENT || t == TIER_BENT_LIED) == bent, case, || format!("R5 BENT iff taken|stray|report_taken (tier {t})"));
                // CONTRACT §4 since 4944dac (IA-20): BENT_LIED ⇔ bent ∧ the report understates payments or total
                let denied = x.reported != 0 && (x.decl_payments < x.payments || x.decl_total < x.total_moved);
                f.check(!bent || ((t == TIER_BENT_LIED) == denied), case, || format!("R5 BENT_LIED iff understated (tier {t}, denied {denied})"));
                f.check(t != TIER_BENT_LIED || lied, case, || "R5 BENT_LIED without a lie".into());
                if t == TIER_CLEAN || t == TIER_FLAGGED {
                    f.check(x.reported == 1 && x.paid_mask == full && x.wrong_pays == 0 && x.reserve_moved == 0 && !lied
                        && x.rep_operating == x.op_left && x.rep_reserve == true_res, case, || format!("R5 CLEAN/FLAGGED with a fault: {x:?}"));
                    f.check((t == TIER_FLAGGED) == (x.flagged != 0), case, || "R5 FLAGGED iff flagged".into());
                }
                f.check(t != TIER_FALSE_REPORT || x.reported == 1, case, || "R5 FALSE_REPORT without a report".into());
                f.check(t != TIER_PENDING, case, || "R5 PENDING after settlement".into());
            }
            // R6 report hits only REPORT plants, only false values equal to the target
            for j in 0..pc {
                if x.report_taken & (1 << j) != 0 {
                    let tj = targets[j];
                    f.check(classes[j] == CLASS_REPORT && ((x.rep_reserve == tj && tj != true_res) || (x.rep_operating == tj && tj != x.op_left)), case, || format!("R6 bad hit {j}"));
                }
            }
            checks += 8;
            runs.push(x);
        }

        // ---------------------------------------------------------------- R7 bounties
        let started: Vec<Run> = runs.iter().copied().filter(|x| x.session != Pubkey::default()).collect();
        let bounty_bps = 1 + r.below(2_500) as u16;
        let cap_bps = bounty_bps + r.below((5_000 - bounty_bps as u64) + 1) as u16;
        let available = if r.chance(0.3) { r.edgy(purse_at_open) } else { purse_at_open.saturating_add(r.edgy(1_000_000_000)) };
        let owed = bounties(&started, pc, purse_at_open, bounty_bps, cap_bps, available);
        let total: u128 = owed.iter().map(|&x| x as u128).sum();
        let cap = (purse_at_open as u128 * cap_bps as u128 / 10_000).min(available as u128);
        f.check(total <= cap, case, || format!("R7 total {total} > cap {cap}"));
        let mut uncapped_total = 0u128;
        for j in 0..MAX_PLANTS {
            let k = started.iter().filter(|x| (x.taken | x.report_taken) & (1 << j) != 0).count() as u128;
            let raw = if started.is_empty() || j >= pc { 0 } else { purse_at_open as u128 * bounty_bps as u128 * k / (started.len() as u128 * 10_000) };
            uncapped_total += raw;
            f.check(owed[j] as u128 <= raw, case, || format!("R7 plant {j} owed {} > uncapped {raw}", owed[j]));
            f.check(k > 0 || owed[j] == 0, case, || format!("R7 plant {j} untaken but owed"));
        }
        if uncapped_total <= cap {
            for j in 0..pc {
                let k = started.iter().filter(|x| (x.taken | x.report_taken) & (1 << j) != 0).count() as u128;
                let raw = if started.is_empty() { 0 } else { purse_at_open as u128 * bounty_bps as u128 * k / (started.len() as u128 * 10_000) };
                f.check(owed[j] as u128 == raw, case, || "R7 cap not binding but owed != formula".into());
            }
        } else {
            cap_bound += 1;
            // pro-rata floors lose at most one lamport per plant
            f.check(total + pc as u128 >= cap, case, || format!("R7 pro-rata lost {} lamports", cap - total));
        }
        checks += 4;

        // ---------------------------------------------------------------- R8 sureties (a random walk on one purse)
        let (mut shares, mut owned, mut held): (u128, u64, Vec<u128>) = (0, 0, vec![]);
        let mut paid_in = 0u128;
        let mut paid_out = 0u128;
        let mut fees = 0u128;
        let mut lost = 0u128;
        for _ in 0..12 {
            match r.below(4) {
                0 | 1 => {
                    let amt = 1_000_000 + r.edgy(100_000_000_000);
                    match shares_for(amt, shares, owned) {
                        Some(m) => {
                            // the old holders' claim before and after: the virtual share/lamport may hand the depositor up to
                            // ~amt/shares lamports of it (rounding-level while shares are lamport-sized); larger is a finding
                            let old = shares;
                            let before = owned as u128;
                            shares = shares.checked_add(m).unwrap_or(u128::MAX);
                            owned += amt;
                            held.push(m);
                            paid_in += amt as u128;
                            if old > 0 {
                                let after = old * owned as u128 / shares;
                                let loss = before.saturating_sub(after);
                                let bound = amt as u128 / old + 2;
                                if loss > max_dilution { max_dilution = loss; }
                                f.check(loss <= bound, case, || format!("R8 a deposit of {amt} took {loss} lamports from holders of {old} shares (bound {bound})"));
                            }
                        }
                        None => f.check(false, case, || format!("R8 shares_for overflow: amount {amt}, shares {shares}, owned {owned}")),
                    }
                }
                2 if !held.is_empty() => {
                    let i = r.below(held.len() as u64) as usize;
                    let s = held.swap_remove(i);
                    let l = lamports_for(s, shares, owned);
                    f.check(l <= owned, case, || "R8 withdraw above owned".into());
                    shares -= s;
                    owned -= l;
                    paid_out += l as u128;
                }
                _ => {
                    if r.chance(0.5) {
                        let fee = r.edgy(1_000_000_000);
                        owned += fee;
                        fees += fee as u128;
                    } else {
                        let b = (owned as u128 * r.below(2_501) as u128 / 10_000) as u64;
                        owned -= b;
                        lost += b as u128;
                    }
                }
            }
        }
        f.check(paid_out + owned as u128 == paid_in + fees - lost, case, || "R8 surety lamports not conserved".into());
        f.check(held.iter().sum::<u128>() == shares, case, || "R8 shares not conserved".into());
        checks += 3;

        // ---------------------------------------------------------------- R10 the epoch record (require_record)
        let mut rec = Record::fresh();
        let (mut nr, mut nt, mut first) = (0u64, 0u64, u64::MAX);
        for k in 0..r.below(40) {
            let t = r.below(8) as u8;
            let seq = 10 + k * (1 + r.below(3));
            rec.add(t, seq);
            if t != TIER_VOID && t != TIER_PENDING {
                nr += 1;
                if first == u64::MAX { first = seq; }
                if t == TIER_BENT || t == TIER_BENT_LIED { nt += 1; }
            }
        }
        f.check(rec.runs == nr && rec.taken == nt && rec.start_round == first, case, || format!("R10 record {rec:?} vs runs {nr} taken {nt} first {first}"));
        let (mr, mb, since) = (r.below(30), r.below(10_001) as u16, r.edgy(200));
        let want = if nr < mr { RECORD_SHORT } else if nt as u128 * 10_000 > mb as u128 * nr as u128 { RECORD_TAKEN } else if first == u64::MAX || first > since { RECORD_RECENT } else { RECORD_OK };
        f.check(record_check(&rec, mr, mb, since) == want, case, || "R10 record_check".into());
        checks += 2;

        // ---------------------------------------------------------------- R11 mul_div (256-bit product), checked by the JS model in BigInt
        let pick128 = |r: &mut Rng| -> u128 { match r.below(4) { 0 => r.u64() as u128, 1 => u128::MAX - r.u64() as u128, 2 => 1u128 << r.below(128), _ => ((r.u64() as u128) << 64) | r.u64() as u128 } };
        let (ma, mb, md) = (pick128(&mut r), pick128(&mut r), pick128(&mut r).max(if r.chance(0.05) { 0 } else { 1 }));
        let mq = mul_div(ma, mb, md);
        // properties checkable in 128 bits: q·d ≤ a·b < (q+1)·d when a·b fits
        if let (Some(q), Some(ab)) = (mq, ma.checked_mul(mb)) {
            f.check(md != 0 && q == ab / md, case, || format!("R11 mul_div({ma},{mb},{md}) = {q}, want {}", ab / md));
        }
        checks += 1;

        // ---------------------------------------------------------------- vectors for the JS model (first 1,000 cases)
        if case < 1_000 {
            let mut v = String::new();
            let runs_json: Vec<String> = runs
                .iter()
                .map(|x| {
                    format!(
                        "{{\"started\":{},\"opLeft\":\"{}\",\"reserveMoved\":\"{}\",\"totalMoved\":\"{}\",\"repOperating\":\"{}\",\"repReserve\":\"{}\",\"declTotal\":\"{}\",\"taken\":{},\"flagged\":{},\"reportTaken\":{},\"payments\":{},\"paidMask\":{},\"wrongPays\":{},\"strays\":{},\"reported\":{},\"declPayments\":{},\"tier\":{}}}",
                        x.session != Pubkey::default(), x.op_left, x.reserve_moved, x.total_moved, x.rep_operating, x.rep_reserve, x.decl_total, x.taken, x.flagged,
                        x.report_taken, x.payments, x.paid_mask, x.wrong_pays, x.strays, x.reported, x.decl_payments, tier(x, n, purse_at_open)
                    )
                })
                .collect();
            let _ = write!(
                v,
                "{{\"seed\":\"{}\",\"task\":{{\"n\":{n},\"amounts\":[{}],\"vendors\":[{}],\"operating\":\"{operating}\"}},\"price\":{{\"minPlant\":\"{min_plant}\",\"lineupAssets\":\"{lineup_assets}\",\"priceBps\":{price_bps},\"stepBps\":{step_bps},\"prices\":[{}]}},\"split\":{{\"runnerBps\":{runner_bps},\"treasuryBps\":{treasury_bps}}},\"maxRuns\":{max_runs},\"plantCount\":{plant_count},\"runsFor\":{rc},\"purseAtOpen\":\"{purse_at_open}\",\"classes\":[{}],\"targets\":[{}],\"runs\":[{}],\"bountyBps\":{bounty_bps},\"capBps\":{cap_bps},\"available\":\"{available}\",\"owed\":[{}],\"md\":[\"{ma}\",\"{mb}\",\"{md}\",\"{}\"]}}",
                hex(&sd),
                amounts[..n as usize].iter().map(|a| format!("\"{a}\"")).collect::<Vec<_>>().join(","),
                vendors[..n as usize].iter().map(|k| format!("\"{}\"", hex(k.as_ref()))).collect::<Vec<_>>().join(","),
                prices.iter().map(|p| format!("\"{p}\"")).collect::<Vec<_>>().join(","),
                classes.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(","),
                targets.iter().map(|t| format!("\"{t}\"")).collect::<Vec<_>>().join(","),
                runs_json.join(","),
                owed[..pc].iter().map(|o| format!("\"{o}\"")).collect::<Vec<_>>().join(","),
                mq.map(|q| q.to_string()).unwrap_or_else(|| "none".into())
            );
            if case > 0 {
                vec_json.push(',');
            }
            vec_json.push_str(&v);
        }
    }
    vec_json.push(']');
    if let Some(p) = out {
        std::fs::write(&p, vec_json).expect("write vectors");
    }
    // R9 the share math under repeated near-empty purses (bounties take a purse to dust while shares stay): when does a deposit overflow?
    let (mut s, mut empties) = (100_000_000_000u128, 0u32);
    while let Some(m) = shares_for(100_000_000, if wiped(s, 1) { 0 } else { s }, 1) {
        if wiped(s, 1) { s = 0; }
        match s.checked_add(m) {
            Some(x) => s = x,
            None => break,
        }
        empties += 1;
        if empties > 64 {
            break;
        }
    }
    println!(
        "rules fuzz · seed {seed} · {cases} cases · {checks} checks · tiers seen VOID {} CLEAN {} FLAGGED {} INCOMPLETE {} FALSE_REPORT {} BENT {} BENT_LIED {} · cap bound in {cap_bound} · max deposit dilution {max_dilution} lamports · R9: deposits overflow after {empties} purse-to-1-lamport events · failures {}",
        tiers_seen[7], tiers_seen[1], tiers_seen[2], tiers_seen[3], tiers_seen[4], tiers_seen[5], tiers_seen[6], f.0.len()
    );
    for l in &f.0 {
        println!("FAIL {l}");
    }
    if !f.0.is_empty() {
        std::process::exit(1);
    }
}

fn seed_of(r: &mut Rng) -> [u8; 32] {
    let h = r.bytes32();
    seed(r.u64(), r.u64(), &h)
}
