# Internal Affairs: on-chain fuzz and property testing

Status: **round 4, final for program `59a10c0`** (2026-11-25). Reviewer: the IA `fuzz` agent (same independent reviewer as `reports/audit.md`), working only on the
program `ia`. It wrote none of the program code and changed none of it; every finding went to the program owner. Everything here re-runs
from `ia/fuzz/` (§6). Invariants: `fuzz/INVARIANTS.md`.

## 1. Snapshots and runs

The program changed three times while the fuzzer ran. `fuzz/build.sh` builds a snapshot of the working tree (or a commit) in the
scratchpad, never in `ia/program`, with the `quick` feature (window floors of 5 slots), and records the sha256 of every source in
`fuzz/results/snapshot*.json`.

| run | program | what it added | seed | rounds | acts | probes | invariant checks | unexpected |
|---|---|---|---|---|---|---|---|---|
| 1 | `dc45f86` (scaffold) | — | 1 | 2 | 123 | 117 | 605 | 14: IA-01 ×8, IA-05 ×2, IA-03 ×1, 3 harness slips (fixed) |
| 2 | round-2 tree (`lib.rs fd7f6ec9…`, `snapshot-round2.json`) | fixes IA-01…08, 10; withhold, busy, rotation, reap, league, close | 5 | 9 | 253 | 517 | 1,659 | **0** |
| 3 | round-3 tree (`snapshot-round3.json`) | fixes IA-09, 11, 15, 17, 18, 19; exit gap, mul_div, share epochs | 8 | 5 | 147 | 323 | 1,022 | **0** |
| 4 | **`a9eca56`** (`snapshot.json`; quick build's rotation delay starts at 300, so `apply_agent` now fires) | the committed program | 9 | 6 | 271 | 340 | 1,354 | **0** |

| 5 | `59a10c0` | the IA-20 tier rule (model amended: BENT_LIED ⇔ understated), I1 checks `sureties_open` | 10 | 5 | 218 | 341 | 1,286 | **0** |

**Round 4: the paths `fuzz.mjs` did not reach** (`fuzz/lifecycle.mjs`, the snapshot plus a test consumer program `fuzz/consumer`,
loaded by `chain.sh` at `C5qno3ZR…`):

| seed | program | R rotation | S spill | C require_record (CPI) | D closing | unexpected | closing: lamports in program → returned, accounts left |
|---|---|---|---|---|---|---|---|
| 1 | `a9eca56` | 12 cases, 1 rotation | 55 | 420 | 37 | **0** | 9,454,669,340 → 9,454,669,340, 0 |
| 2 | `a9eca56` | 23 cases, 2 rotations | 22 | 529 | 38 | **0** | 5,827,511,965 → 5,827,511,965, 0 |
| 3 | `59a10c0` | 11 cases | 22 | 529 | 41 | **0** | 9,369,800,122 → 9,369,800,122, 0 |

- **R**: `propose_runner`/`apply_runner` with the rotation delay moved up and down; every `runner_at` equals the model's `slot +
  delay(slot)` with the lowered-delay floor (`delay_floor`, `delay_floor_until` compared after every `set_params`); `apply_runner`
  judged at the exact slot each simulation ran (TooEarly before, ok from `runner_at`); cancel by proposing the current runner; after the
  switch the old runner is refused (`draw`: NotRunner) and the new one cannot plant or stand surety.
- **S**: `spill` before plants, after plants, after the dockets opened, after the first settlement, on a settled round and while closing;
  it moves exactly `lamports − rent − runner_fund_cap` into `purse_pool`/`purse_left`/`spilled` and leaves the fund at rent + cap, and
  refuses (NoPending) in every other case.
- **C**: `require_record` direct and through `fuzz/consumer::gate` (pinned ia, return-data program id checked, compared with a direct
  read through `rules::record_check`) with random `min_runs`, `max_taken_bps`, `since_round`, `allow_league` on every house and league
  agent after every round: both always equal the JS model (`recordCheck`, from the CONTRACT text), including LeagueRecord. Accounts
  that are not an Agent PDA (config, fund, a round, a wallet, an unused id) are refused; the careful consumer refuses a fake ia; the naive
  consumer believes it (audit IA-24, by design of the test).
- **D**: closing from the middle of a round (plant window open, a surety mid-unbond, unclaimed bounties in older rounds): every call
  that must stop does (open_round, plant, deposit, add_agent, start_run, spill, close_config while open); open dockets settle at once
  without runs or roots; every round reaps at once with unclaimed bounties to their planters (none to the fund); every surety gets
  exactly `⌊shares × owned / total⌋`; `close_agent` refuses a wrong recipient; `close_config` closes the rest. **Every program account
  is gone and every lamport the program held went to a party** (sum of balance changes of all parties, fees paid by a separate payer).
  After `close_config` the upgrade authority could `init_config` again (simulated: ok); with no account left this is a clean slate.

Rules property runs (`fuzz/rules`, `cargo run --release`): seeds 1–3 on `dc45f86` (10k + 20k + 20k cases), seed 4 on round 2 (20k),
seeds 6–7 on round 3, seed 10 on `a9eca56` and seed 11 on `4944dac` (the IA-20 tier rule; R5 now checks BENT_LIED ⇔ bent ∧ understated) (20k each): **0 failures, 0 model mismatches** in every run (about 1.2–1.3 M checks per 20k cases; results in
`fuzz/results/rules-*.txt`).

## 2. Method

**Two engines.**
1. `fuzz/rules` (Rust, links the snapshot's `ia::rules`): per case a random round inside the hard caps (seed, lineup assets including
   values near u64::MAX, params, 1–16 plants of random class and target, up to 8 run ledgers shaped like real runs: honest, sloppy,
   thief, liar, refuser) and the invariants R1–R11. The first 1,000 cases of each run are written as vectors and recomputed by
   `fuzz/model.mjs`, a JS model written **from the CONTRACT text, not from rules.rs** (task, price, split, runs, tiers, report hits,
   bounties, and `mul_div` in BigInt).
2. `fuzz/fuzz.mjs` (Node, against a local `solana-test-validator` 4.1.2 on the fuzz ports, RPC 60899): seeded rounds with 5 house
   agents, 8 planters (3 of them $IA holders), 6 sureties. Each round: lineup churn through `set_agent`/`apply_agent`, deposits, unbond
   requests and withdrawals, draws, reaps of old rounds; plants of every class and medium; a random `withhold_plants` mask; one session
   per run doing a random behaviour; every `Acted` compared with the model's replay (hit, moved, key plants, **trail**); the docket's
   run fields compared after the run; settlement in random order by random callers, with the tiers and every bounty compared with the
   model; claims; then the global invariants. Hostile calls are **probed by simulation** (so a hole is recorded without corrupting the
   run): see INVARIANTS.md P.

**Determinism.** Keys, behaviours, amounts and orders come from a xoshiro256** generator seeded by `SEED`; only slot timing is not
reproducible (the model reads slots from the chain).

## 3. Results

### Findings the fuzzer produced or confirmed
| id | how found | run | status |
|---|---|---|---|
| IA-01 Critical | probe "re-open and re-settle a settled docket" went through on every docket (8×) | 1 | fixed; probe refused (`Settled`) on every docket of runs 2–3 |
| IA-05 High | probe "draw the whole runner fund" went through | 1 | fixed; refused (`DrawCap`) every round |
| IA-03 High | probe "KEY plant reusing a canary" went through | 1 | fixed; refused (`DuplicateCanary`) |
| IA-11 Medium | R9: from 100 SOL of shares, 3 purse-to-dust events make `shares_for` overflow; R8 measured the virtual-share dilution | rules 1–4 | fixed in round 3: R9 runs 64 such events without overflow (the share-epoch reset), `mul_div` matches BigInt on 2,000 vectors and 40k property cases |
| — | R8: a deposit can take up to ⌈amount / old shares⌉ + 1 lamports from holders of very few shares (max seen 2.76 SOL, only when old shares ≪ amount, e.g. after near-total withdrawal) | rules | Info: bounded, needs holders to shrink their own share count; noted in audit IA-11 |
| — | `plant_price` clamps at u64::MAX; CONTRACT §3 does not say so (the JS model now clamps) | rules 1 | Info: CONTRACT §3 should state it |

### Invariants: all held after the fixes
I1 purse lamports = rent + assets, orphan ≤ assets, Σ surety shares = agent shares (current share epoch); I2 round lamports = rent +
purse_left + Σ owed, settled count/mask/state consistent; I3 treasury and runner fund balances (in − out + reaped + forfeits − spilled)
and the fund account exists; I4 every tier and bounty = the model; I5 task numbers, every `Acted` and every run field = the model;
I6 price, split, withdraw = the model; I7 caps, no bounty without a taken run, no bounty for a withheld plant; I8 claims; I9 reap moves
exactly the unclaimed bounties and closes the round. Zero violations in runs 2 and 3.

## 4. Coverage

The program's own `test/vectors.json` (162 values) also matches the JS model (`node fuzz/vectors-check.mjs`: 0 mismatches).

Instructions driven with real state: `init_config, set_params, set_roles, add_agent, set_agent, apply_agent, open_round, plant,
commit_harness, withhold_plants, open_docket, start_run, act, post_transcript, settle_docket, close_empty_round, claim_plant,
reap_round, deposit, request_unbond, withdraw, draw`. Only in the audit tests: `register_agent, leave_league` (IA-18/19).
Round 4 added `propose_runner, apply_runner, spill, require_record` (direct and by CPI), `register_agent, close_begin, close_surety,
close_agent, close_config` and the closing branches of `open_docket, settle_docket, close_empty_round, reap_round`. **Still not fuzzed:**
Token-2022 holder accounts and `leave_league` beyond the audit test.

Tiers settled across runs 2–4 (163 runs): CLEAN 23, FLAGGED 4, INCOMPLETE 23, FALSE_REPORT 17, BENT 65, BENT_LIED 7, VOID 24; every one
equal to the model. Run 4 retired agent 0 through `set_agent` → `apply_agent` (lineup 1–4 from round 2 on).

## 5. Open items
- Token-2022 holder accounts (the $IA mint is SPL Token at launch).
- A longer run (≥ 50 rounds) once the program is committed; rounds take 2–5 minutes each on this machine with 5 agents.

## 6. Re-run
```
cd ia
zsh fuzz/build.sh                         # snapshot build (SNAP_REF=<commit> for a commit)
SEED=1 CASES=20000 zsh fuzz/rules.sh      # rules property tests + JS model differential
zsh fuzz/chain.sh                         # fuzz chain on 60899 (waits while 3 validators run)
SEED=9 ROUNDS=6 node fuzz/fuzz.mjs        # → fuzz/results/run-9.json (IA_IDL=<path> to load another IDL)
node fuzz/vectors-check.mjs               # program/test/vectors.json vs the JS model
SEED=1 ROUNDS=4 node fuzz/lifecycle.mjs   # rotation, spill, require_record by CPI, closing (fresh chain; it closes the program)
node --test --test-concurrency=1 audit/test/   # the audit proof tests on the same chain (fresh chain first)
zsh fuzz/chain.sh stop
```
