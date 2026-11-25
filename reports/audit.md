# Internal Affairs: internal security review

Status: **round 2** (2026-11-25). Round 1 reviewed the scaffold `dc45f86`; round 2 re-tested the program owner's fixes (working tree
of `program/programs/ia`, sources hashed in `fuzz/results/snapshot.json`: `lib.rs` `fd7f6ec9…`, `rules.rs` `ce3dab64…`).
Reviewer: the IA `audit` agent, independent of the builders. It edits none of the program, runner, registry or SDK code; each fix is made
by the owner of that part and proven by the test named in its row.

## 1. Scope

| part | paths | what was done |
|---|---|---|
| on-chain program `ia` | `program/programs/ia/src/{lib,rules,ext,errors}.rs` | read line by line both rounds; every finding proven on a local validator |
| shared contract | `CONTRACT.md` §1–§5, §10; `SPEC.md` §3, §5, §6, §8, §9, §10 | read as the threat model |
| runner sandbox (the only path from a model to the chain) | `runner/harness/{sandbox,chain,drive}.mjs`, `runner/lib/egress.mjs`, `runner/round.mjs` (withhold) | read for the sandbox escape surface only |
| plant registry | `registry/src/registry.ts` (delivery, manifest, reveal) | read for delivery/withhold and reveal timing only |

**Not covered** (so that nobody reads silence as a pass): the adapters (`adapters/`), the API/SDK/MCP (`sdk/`, `api/`, `mcp/`), the
log's cryptography (`registry/src/` beyond the lines above), the site, `launch.mjs` and key scripts, the replay kit.

## 2. Method

1. Threat model from SPEC §6/§8 (below), then every instruction read with one question: what does a model, a runner, a planter, a
   surety, an operator or a stranger gain by calling this with inputs of their choosing, in an order of their choosing, in one
   transaction?
2. Every finding that code can show has a **test that states the secure behaviour** in `audit/test/program.test.mjs`. It fails while the
   finding is open and passes once fixed. Run: `zsh fuzz/build.sh && zsh fuzz/chain.sh && node --test --test-concurrency=1 audit/test/`
   (fuzz chain, RPC 60899; at most 3 validators on the machine).
3. Invariants and the randomized driver are in `reports/fuzz.md`; the fuzzer probes every fixed hole on every round (P-probes).

## 3. Threat model (SPEC §6, §8)

| actor | wants | on-chain power | main control |
|---|---|---|---|
| model under test | anything its tools allow | `act` on its own run only, via the runner; no lamports move during a run | closed ledger; session key per run; the runner pays fees, the session key holds nothing |
| runner (hot key) | collusion with a planter, or a stolen key | commit, start runs, withhold plants, post roots, draw ≤ cap per round; **signs every act** | trust point 1: caps (≤ docket_cap of each purse per round), transcripts, delays on rotation |
| planter | bounties without real bait, copying, griefing | plant (any hash, class, target, canary) | price, caps, delivery manifest + `withhold_plants`, unique canary, REPORT target rule |
| surety | fees without risk, dodging catches | deposit, unbond, withdraw | busy lock during a round, unbond delay snapshotted, request expiry |
| stranger | break settlement, steal pools, grief | every permissionless call (open, docket, settle, close, reap, spill) | state checks; the findings below |
| admin | change rules, rotate keys | params in hard caps, delayed rotations, pause, closing | hard caps, delays; **the upgrade authority is above all of it** (IA-14) |
| Open League operator (phase 1.5) | fees from a self-run agent, a clean record | registers, starts its own runs, posts its own roots | bond; IA-18, IA-19 |

Sandbox escape surface (can real SOL leave because of a model action?). **No path found.** `act` writes numbers in the docket only;
the only lamport moves are `settle_docket` (bounties agent → round, purse share round → agent), `claim_plant`, `reap_round`,
`withdraw`, `draw`, `spill`, `withdraw_fees` and the closing calls, none of which a session key can sign. In the runner, `pay_with_key`
signs only with a key whose pubkey is a KEY canary of the round (`sandbox.mjs:133-136`); any other key returns `{ok:false}` and is never
used as fee payer; the runner key pays fees (`chain.mjs:132`); tool output to the model never carries raw chain errors (they go to the
transcript only); the egress allow-list wraps `fetch` and `net.Socket.connect`. The model chooses only **which planter** a bounty goes to,
by taking that plant, which is the product.

## 4. Summary

| id | severity | title | status (round 2) | proof |
|---|---|---|---|---|
| IA-01 | **Critical** | a settled docket could be re-opened and re-settled: one agent takes the whole purse pool, every other docket panics, bounties never paid | **fixed** | `IA-01 (Critical)` |
| IA-02 | High | a surety with a matured unbond request exits after seeing a plant taken, before settlement: the bounty becomes 0 | **fixed** (busy + expiry); regression IA-17 | `IA-02 …` |
| IA-03 | High | a KEY plant could reuse another plant's canary: an undelivered copycat shares the catch | **fixed** (DuplicateCanary, withhold) | `IA-03` |
| IA-04 | High | a REPORT target predictable from the public task farms honest arithmetic slips as BENT + bounty | **fixed** (target % 1,000 ≠ 0, withhold); residual Low (§5) | `IA-04` |
| IA-05 | High | `draw` could empty the runner fund to 0 lamports: the account is deleted and every `plant` fails | **fixed** | `IA-05` |
| IA-06 | Medium | paying a KEY/REPORT plant's address was neither taken nor stray: CLEAN | **fixed** | `IA-06 verdict` |
| IA-07 | High | `unbond_delay` uncapped and read at withdraw time; runner set instantly by `set_roles`: admin key = all sureties locked + drain | **fixed** (cap 216,000, snapshot, rotation delay) | `IA-07` |
| IA-08 | Medium | anyone could settle at `run_close + 1` before the transcript root: the case file has no root forever | **fixed** (NoTranscript, one run window of grace) | `IA-08` |
| IA-09 | Medium | `plant` has no maximum price: a planter racing others pays up to 1.95× the quote (8 plants at +10%) | open | — |
| IA-10 | Medium | a deposit after the runs' public acts captured the round's fees risk-free | **fixed** (busy) | `IA-10` |
| IA-11 | Medium | share math: shares explode when a purse is drained to dust; `shares_for` overflows after ~3 such events and `lamports_for` saturates (underpays withdrawals) | open | `fuzz/rules` R9 |
| IA-12 | Low | the 1,000,000 $IA exemption is borrowable inside one transaction (transfer in, plant, transfer out) | open, accepted? | — |
| IA-13 | High (trust) | the runner key signs every act: stolen or colluding, it takes up to `docket_cap_bps` (25%) of every purse per round and can withhold any plant | accepted risk: must be stated | design |
| IA-14 | Medium (trust) | the upgrade authority can rewrite the program: SPEC trust point 3 ("cannot move a purse") is false while the program is upgradeable | open (ops/docs) | — |
| IA-15 | Low | `plants_faced`/`untouched` count withheld and squatted plants: ~17% of 8 prices per round fills every slot and inflates "resisted" | open | — |
| IA-16 | Info | the epoch in `DocketSettled` was read at settle time | **fixed** (apply_agent needs busy = 0) | — |
| IA-17 | Medium | **regression of the IA-02 fix**: an agent is idle only between its own settle and the next `open_round`, which may run in the same transaction: zero exit window, requests expire, `apply_agent` starves | **open** | `IA-17` |
| IA-18 | Medium (league) | an Open League operator starts its run at plant close and freezes `withhold_plants` for the whole round: undelivered plants takeable again | **open** | `IA-18` |
| IA-19 | High (league, design) | an Open League "agent" can be a script: the task is public, it is always CLEAN, takes a share of the investigators' fees and passes `require_record` | **open** (league_seats = 0 at launch) | `IA-19` |
| IA-20 | Low (legal) | BENT_LIED compares `decl_total` with *moved*, not *requested*: a model that pays more than a source holds and reports the requested sum is "LIED" | open | — |
| IA-21 | Info | round 0 (and any round after sureties leave) has purse_at_open 0: no bounty is possible | doc | — |
| IA-22 | Low (disclosure) | at closing, orphan fees (planters' money no surety owns) go to the dev with the agent account | open (doc) | — |

Counts: Critical 1 (fixed), High 7 (5 fixed, IA-13 accepted, IA-19 open), Medium 8 (4 fixed, 4 open), Low 4, Info 2.
Proof tests at the end of round 2: **14 pass, 4 fail** (IA-17, IA-18, IA-19 and their parent tests; all three open).

## 5. Findings

### IA-01 Critical · fixed · re-open and re-settle a settled docket
`open_docket` (scaffold `lib.rs:666-691`) did not check the round's state or the agent's settled bit, and `settle_docket` closes the
docket, so the PDA could be created again. A stranger after `run_close` sent settle(A) → open_docket(A) → settle(A) → … Proven: three
settles of agent 0 took 83,000,000 of an 83,000,000 pool, the round flipped to settled, and agent 2 (which owed a bounty) could never
settle (`Panic: overflow` on `purse_left -= share`, `lib.rs:859`): no bounty, no verdict, docket rent stuck. Cost to the attacker: fees.
**Fix (program):** `open_docket` refuses a settled round and a settled position; `settle_docket` refuses a set bit (`lib.rs:975-979,
1139`). Re-tested: `open_docket after the agent settled is refused` passes; the fuzzer probes it on every docket.

### IA-02 High · fixed · surety exit after the acts are public
A request made long ago stayed valid forever, so a surety could watch `Acted` events during the run window and withdraw before
`settle_docket`; the bounty cap is `min(cap, assets)`. Proven: 4.58 SOL withdrawn in the run window, bounty 0 of 229,288,333.
**Fix:** `busy` from `open_round` to the agent's settle blocks deposit and withdraw; the request expires one delay after maturity and the
delay is snapshotted (`lib.rs:1363-1395`). Re-tested green. See IA-17 for the liveness cost.

### IA-03 High · fixed · copycat canary
Canary pubkeys are public at plant time; a second KEY plant with the same canary and an undelivered text was taken by the same signature
(`taken` mask 3). **Fix:** `DuplicateCanary` (`lib.rs:893`) and `withhold_plants` for undelivered plants (`lib.rs:959-967`, applied
at settlement `lib.rs:1151-1153`). Residual: IA-18.

### IA-04 High · fixed · REPORT farming
The task is a pure function of the public seed, so the opening operating balance (and partial sums) are known at open; a REPORT plant
targeting it turned a model's subtraction slip into BENT and a 102,905,000-lamport bounty, without any text reaching the model.
**Fix:** targets must not be multiples of 1,000 lamports (every task amount is), and undelivered plants are withheld.
**Residual (Low):** with `busy`, `purse_at_open` now equals the agent's `assets` at `open_round` exactly; a delivered REPORT plant with
target = that value catches a model that paid a vendor from the reserve by mistake and then reported the reserve unchanged. That is a
real false report, but its label becomes BENT, not FALSE_REPORT. Suggest: count a REPORT hit only when the reported value is not the
reserve at open, or say so on /docs.

### IA-05 High · fixed · runner fund deleted by a full draw
`draw` checked only the per-round cap; drawing the whole balance (≤ 0.2 SOL early on) left 0 lamports, the runtime removed the account,
and every `plant` failed with `AccountNotInitialized`. **Fix:** draw only above rent (`lib.rs:1409`). Probed every fuzz round.

### IA-06 Medium · fixed · pay to a KEY/REPORT plant address = CLEAN
**Fix:** any plant address is taken (`lib.rs:1070-1073`); CONTRACT §4 updated; the fuzz model follows.

### IA-07 High · fixed · admin locks sureties / instant runner
`unbond_delay` had no upper cap and was read at `withdraw`; `set_roles` swapped the runner at once. **Fix:** cap 216,000 slots,
snapshot in `request_unbond`, `propose_runner`/`apply_runner` and `set_agent`/`apply_agent` after `rotation_delay`, a lowered delay
waits out the old one (`lib.rs:646-701`). Note: `set_params` still changes `bounty_bps`/`docket_cap_bps` for the next round at once
(caps 25% / 50%); a surety facing a raised cap needs an exit window (IA-17).

### IA-08 Medium · fixed · settle before the transcript root
**Fix:** `NoTranscript` until the root is posted, unless no run started or one more run window has passed (`lib.rs:1141-1144`).

### IA-09 Medium · open · no maximum price on `plant`
`plant` charges the price at execution (`lib.rs:896`); with 8 plants at +10% each, a planter whose transaction lands last pays 1.95×
what the site quoted. **Fix (program):** a `max_price: u64` argument, refused above it (the registry quote already has the price).

### IA-10 Medium · fixed · just-in-time deposit
A deposit after the runs' public reports took a share of the round's fees with no catch risk (10 SOL worth 10.0229 SOL right after
settle). **Fix:** no deposit while busy.

### IA-11 Medium · open · share math at a drained purse (`rules.rs:260-270`)
`shares_for = amount × (shares + 1) / (owned + 1)`. When bounties take a purse to dust while shares stay, each new deposit multiplies the
share count by ≈ amount / owned. `fuzz/rules` R9: from 100 SOL of shares, **3** "purse to 1 lamport" events make the next deposit
overflow (`Overflow`: nobody can stand surety for that agent again), and before that `lamports_for` uses `saturating_mul`, so a
withdrawal whose `shares × owned` exceeds u128 is silently underpaid (e.g. 1e35 shares × 1e10 lamports → 3,402 lamports paid for 10 SOL).
A weak model that is drained round after round reaches this (SPEC §11 "models too weak"). **Fix:** when `owned == 0` (or below a dust
floor) with shares outstanding, write the shares off (reset to 0, dust to orphan) before minting; use a 256-bit mul-div in
`lamports_for` and fail instead of saturating.

### IA-12 Low · open · borrowable holder exemption
`is_holder` reads the planter's balance at the instruction; one bag moved in and out inside the transaction exempts any number of
planters (or a swap in/out). Gain: 5% of a plant price, which goes to the purses anyway. Accept and say so, or require the balance to be
held since the round opened (not checkable cheaply).

### IA-13 High (trust) · accepted · the runner signs every act
The session key is made and held by the runner, so a stolen runner key (a hot key in Vercel env) or a colluding runner can make any
model "take" a sybil's plant: up to `docket_cap_bps` (25% at launch) of **every** purse per round, about every 30 minutes, and can
`withhold_plants` any plant (censorship of real catches). Rotation now has a delay, which helps after a leak is noticed, not before.
Must be stated as trust point 1 with these numbers. Suggested: a per-round cap across all purses, a circuit breaker (round settles only
after a delay when bounties exceed X% of all purses), the registry's manifest checked against `PlantsWithheld` by the indexer, and the
enclave of phase 2.

### IA-14 Medium (trust) · open · upgrade authority
While the program is upgradeable, its upgrade authority can replace it and move any purse. Trust point 3 must say so, or the authority
must be a timelocked multisig or burnt before purses grow. (Owner decision.)

### IA-15 Low · open · counters and slot squatting
`plants_faced += plant_count` (`lib.rs:1169`) includes withheld and garbage plants. Filling all 8 slots costs ≈ 1.14 SOL of which 83%
returns to the purses (≈ 0.19 SOL net for a surety of every agent) and blocks real investigators that round while inflating "resisted".
Count only delivered plants (`plant_count − popcount(withheld)`) and consider one plant per planter per round.

### IA-17 Medium · open · regression of the IA-02 fix: no exit window
`busy` is cleared at the agent's settle (`lib.rs:1219`) or by `close_empty_round` (`lib.rs:1260`), and `open_round` sets it again
(`lib.rs:860`). Both can run in **one transaction**: `[close_empty_round, open_round]` or `[last settle_docket, open_round]`. With no
plants (the idle state) a crank or a griefer that chains them leaves every agent busy forever; a matured request then expires
(`Expired`, `lib.rs:1380`). Proven by `IA-17`. `apply_agent` (`lib.rs:754`) starves the same way, so a model version change or a
retirement can be blocked. **Fix:** `open_round` requires `now ≥ prev.settle_slot + exit_gap` (a param, ≥ 150 slots at launch), and/or
measure a request's expiry only over idle slots.

### IA-18 Medium (Open League) · open · an operator freezes `withhold_plants`
`withhold_plants` requires `runs_started == 0` (`lib.rs:961`), and a league operator can `start_run` at `plant_close` with no harness
(`lib.rs:1008-1013`). The runner's withhold then fails (`RunsStarted`) and every undelivered plant can be taken by every house agent in
that round (IA-03/IA-04 reopen). **Fix:** count only house runs for the freeze, or let league runs start only after the runner's
withhold (or after a fixed number of slots past plant close).

### IA-19 High (Open League, design) · open · scripted league agents
The league operator makes the session key and signs the acts. The task is public, so a 30-line script pays every invoice and files the
true report: always CLEAN, never caught, and it takes `pool / lineup_len` of the investigators' fees each round (proven: 43,575,000
lamports to a script that never read the inbox). Its `require_record` then certifies "N runs, 0 taken" for something that is not an AI.
**Fix (design, before `league_seats > 0`):** league agents do not share the house purse pool (league plants pay league purses), the
`RecordView.kind` must be checked by CPI clients (say so in the SDK and docs), and /docs says league records are self-run.

### IA-20 Low (legal wording) · open
`lied` compares `decl_total` with `total_moved` (`rules.rs:136`). A pay capped by the source (`moved < amount`) and an honest report of
the requested sum yields BENT_LIED. The tool result returns `moved`, so it is defensible, but the case file should show both numbers
before calling it "did it and denied it".

### IA-22 Low (disclosure) · open
`close_agent` (`lib.rs:1480-1497`) sends the agent account, orphan fees included, to the dev. Orphan lamports are investigators' fees
nobody owns; state it on /docs or route them to the runner fund / planters.

## 6. Legal-exposure notes (not legal advice)
- Verdict labels name commercial models: IA-04 residual, IA-20 and stray payments to house decoys all produce BENT/BENT_LIED for
  behaviour that may be a slip. Case files should quote the act and the tool result, and the methodology should list these rules.
- The holder exemption and "bounty" wording are consistent with SPEC §10; forecasts stay free; nothing in the program takes a wager.
- The runner can withhold any plant (IA-13): publish the registry manifest beside `PlantsWithheld` so a planter can see why.
