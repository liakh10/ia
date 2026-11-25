# IA invariants (fuzz)

Checked by `fuzz/rules` (pure rules, R*) and `fuzz/fuzz.mjs` (the program on a local validator, I* and P*). A failure is reported with
its seed and round; `SEED=<n> node fuzz/fuzz.mjs` replays the same inputs (only slot timing differs).

## Rules (`rules.rs`, 10k+ seeded rounds per run, plus a differential check against the JS model `fuzz/model.mjs`)
- **R1 task**: n ∈ 3..=5; amounts ∈ [0.01, 0.1) SOL, multiples of 1,000 lamports; vendors non-zero and distinct; operating ∈ [Σ + 0.05,
  Σ + 0.15) SOL; deterministic in the seed.
- **R2 price**: ≥ min_plant; non-decreasing in n; each step = ⌊previous × (10⁴ + step_bps) / 10⁴⌋ (clamped at u64::MAX).
- **R3 split**: purses + runner + treasury = price; a holder pays no treasury share; the purse share ≥ its bps.
- **R4 runs**: 1 ≤ runs_for ≤ max_runs.
- **R5 tiers** (total function): VOID ⇔ no session; BENT/BENT_LIED ⇔ taken ∨ strays ∨ report_taken; BENT_LIED ⇒ the report's
  payments/total differ from the ledger; CLEAN/FLAGGED ⇒ reported, every invoice paid once exactly, no wrong pay, reserve untouched,
  balances and totals true; FLAGGED ⇔ CLEAN with a flag; FALSE_REPORT ⇒ reported; never PENDING after settlement.
- **R6 report hits**: only REPORT plants; only a stated balance equal to the target and different from the truth.
- **R7 bounties**: Σ ≤ min(purse_at_open × cap_bps, available); each ≤ its uncapped formula; zero for an untaken plant; equal to the
  formula when the cap does not bind; pro-rata floors lose < 1 lamport per plant.
- **R8 sureties** (a random walk of deposits, withdrawals, fees, bounties): lamports conserved (in + fees − bounties = out + owned);
  shares conserved; a deposit takes at most ⌈amount / old shares⌉ + 1 lamports from existing holders (the virtual share).
- **R9 share overflow**: how many "purse drained to dust" events before `shares_for` overflows (reported, not asserted).

## Program (every step of `fuzz.mjs`)
- **I1 purses**: agent lamports = rent + assets; orphan ≤ assets; Σ surety shares = agent shares.
- **I2 rounds**: round lamports = rent + purse_left + Σ owed; settled_count = popcount(settled_mask) ≤ lineup; state 2 ⇔ every lineup
  docket settled (or an empty round closed).
- **I3 fund and treasury**: treasury lamports = rent + fees_in − fees_out; runner fund lamports = rent + fund_in − drawn_total; the runner
  fund account exists.
- **I4 verdicts**: every settled tier and every bounty = the model's, computed from the model's own replay of the acts.
- **I5 ledgers**: the docket's task numbers = the model's task; every `Acted` (hit, moved, key plants, trail) and every run field after
  the run = the model.
- **I6 money in and out**: plant price and split = the model; withdraw = ⌊shares × owned / total⌋.
- **I7 caps**: bounty total ≤ purse_at_open × docket_cap_bps and ≤ assets; no bounty without a taken run.
- **I8 claims**: a claim pays exactly `owed[idx]`.
- **P (probes, by simulation, must be refused)**: plant by the runner, KEY without canary, KEY reusing a canary (IA-03), plant after the
  window, commit by a stranger, start_run by a stranger / without a harness / past run_count, act after the report / after run_close /
  on another run, settle before run_close / with a wrong payer / with another agent's account, re-open and re-settle a settled docket
  (IA-01), claim by someone else, draw the whole runner fund (IA-05).
