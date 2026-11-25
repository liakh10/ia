# Program test report: ia

Program: `ia` `CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr` (Anchor 1.2, Rust 1.89, launch build 480,864 bytes). Source:
`program/programs/ia/src/` (`lib.rs` instructions and accounts, `rules.rs` the pure rules, `ext.rs` raw reads). IDL: `program/idl/ia.json`.
Contract: `CONTRACT.md` §1–§5. Vectors for every off-chain reimplementation: `program/test/vectors.json`.

## How it was tested
- **Where:** a local `solana-test-validator` on this part's own ports (RPC 52899), the quick build loaded as an upgradeable program whose
  upgrade authority is a local test key, so `init_config`'s ProgramData check runs as on mainnet. The launch rehearsal runs a second
  chain with pump.fun cloned from mainnet (read-only) and no program loaded: `launch.mjs` deploys the launch build through sol-ops.
  Nothing was sent to mainnet.
- **Two builds:** the suite runs the quick build (window floors of 5 slots, claim window floor 5) so a whole round passes in about a
  minute; the rehearsal and launch day deploy the launch build (windows ≥ 150 slots, claim window ≥ 216,000, exit gap ≥ 150).
- **Rules in isolation:** `rules.rs` unit tests (task numbers, price, split, runs, tiers, REPORT hits, bounties and caps, share math with a
  256-bit mul-div, the wipe-out rule, the epoch record) and a vectors test that fails when `rules.rs` drifts from `test/vectors.json`.
  The vectors were re-derived independently in JavaScript (seed, task numbers, vendor addresses): 0 mismatches on 5 seeds.
- **Recorded runs** (`program/test/.run/runs.txt`):
  - 2026-11-25 15:57:56 unit=10/10 suite=37/37 (audit round 2 fixes)
  - 2026-11-25 16:00:16 rehearse=20/21 (the post-close check read a closed program wrong: fixed in ea0de9c)
  - 2026-11-25 16:09:34 unit=10/10 suite=37/37
  - 2026-11-25 16:11:46 own-ca=23/23 · 16:14:08 rehearse=21/21
  - 2026-11-25 16:23:36 unit=10/10 suite=37/37 (IA-20, 4944dac)
  - 2026-11-25 16:33:06 unit=10/10 suite=37/37 and 16:42:31 unit=10/10 suite=37/37 (final binary, IA-23, 59a10c0): **twice green**
  - 2026-11-25 rehearse=21/21 on the final launch build

## Results
| part | result |
| --- | --- |
| Rust unit tests (rules.rs + vectors) | 10/10 (twice) |
| suite on the local chain (four rounds: the full round, an empty round, an Open League round with spill and withholding, a round closed mid-planting) | 37/37 (twice on the final binary) |
| launch rehearsal (base58 dev key, sol-ops deploy, init, CA first, coin on cloned pump.fun, holder rule, lineup, lookup table, runner float, LIVE, second run, dry run, day one, wind-down mid-round, second wind-down) | 21/21 (twice; the final build included) |
| own-CA launch (the owner's CA in config.js: launch.mjs asks for the create at once, waits, checks the creator) | 23/23 |

The rehearsal's launch from nothing cost the dev 3.4925 SOL on the local clone (local rent, no priority fees), the 0.1 SOL runner float included; wind-down returned 3.4620 SOL of it. Fund on mainnet: 3.60 SOL (`_x/ia/LAUNCH.md`).

### What the suite proves, by instruction
- **init_config / set_params / set_roles:** only the upgrade authority initialises; every hard cap refuses (bad split, treasury over 10%,
  unbond shorter than a round, rotation delay under the unbond delay, league seats over 8, fund cap under the draw cap); `set_roles` sets
  the $IA mint once and can no longer touch the runner.
- **Rounds:** the lineup must be every active agent, ascending, writable; the seed comes from SlotHashes; every second round runs with the
  nudge; a round copies its Params at opening (a mid-round `set_params` with bounty 25% / cap 50% leaves round 0 on 5% / 25%); the next
  round opens only `exit_gap` slots after the previous settled.
- **Plants:** the runner cannot plant; a price above `max_price` is refused; a KEY canary is unique in its round; a REPORT target is never a
  multiple of 1,000 lamports; the price rises 10% per plant from the 0.1 SOL floor; 83/12/5; a 1,000,000 $IA holder pays no treasury share.
- **Runs:** harness once, by the runner, before plant close; dockets only after plant close and never again for a settled agent or round;
  session keys only from the runner (house) or the operator (Open League); acts only by the run's session key, before run close, before
  its report; the trail chains every act; paying any plant's address takes it (TRANSFER and KEY alike), a canary signature takes a KEY
  plant, a REPORT plant's exact target in the report takes it; `withhold_plants` before the first house run (a league run cannot block
  it) masks undelivered plants at settlement.
- **Settlement:** refused before run close, and until the transcript root is posted (or no run started, or one more run window passed);
  tiers CLEAN, FLAGGED, INCOMPLETE, BENT, BENT_LIED, VOID from the ledger alone; bounties 5% × taken runs / started runs, capped; the purse
  pool to house agents only (league agents take none; a VOID house agent keeps its share); a league agent that never ran leaves the league;
  stats and the epoch record; dockets close to their payer.
- **Claims and reap:** each planter claims once; the newest round is kept; after the claim window an unclaimed bounty goes to the runner
  fund, the plant's rent to its planter and the round's rent to its payer; a wrong (plant, planter) list is refused.
- **Sureties:** first deposit 1:1; no deposit and no withdrawal while the agent is under test (from `open_round` to its settlement); the
  unbond request snapshots its delay, matures, and expires one delay later (counted again after any test in between); the runner key
  never stands surety; an Open League agent takes only its operator's money and keeps its minimum bond while active.
- **Runner fund:** draws by the runner only, ≤ the cap per round, never below rent; the surplus above `runner_fund_cap` spills into the
  newest round's purse pool once.
- **Rotation and lineup changes:** `propose_runner` waits `rotation_delay`; a lowered delay waits out the old one; `apply_runner` by
  anyone after it, then the old key is refused; `set_agent` schedules, `apply_agent` waits the delay and never runs while the agent is
  under test; a new exact version opens epoch 2 with a fresh record.
- **require_record:** returns the record (return data); refuses a short record, a taken rate above the limit, a record that does not
  reach back to the asked round, and an Open League record unless `allow_league`.
- **Closing:** after `close_begin` nothing new starts; the open round settles at once and is reaped with bounties straight to planters;
  every surety is paid; every agent closes to the dev (house) or its operator (league); the config, treasury and fund close to the dev;
  the program owns no account. `wind-down.mjs` does the same in one run on the launch build (rehearsal).

## Audit findings owned by the program (reports/audit.md)
| finding | fix | proven by |
| --- | --- | --- |
| IA-01 Critical: re-open and re-settle a docket | `open_docket` refuses a settled round or agent; `settle_docket` refuses a settled agent | suite "a settled docket cannot be opened again"; audit IA-01 |
| IA-02 High: surety exit after the acts | busy from `open_round` to settlement; unbond expiry | suite "under test"; audit IA-02 |
| IA-03 High: copycat canary | canary unique per round | suite "plant" (DuplicateCanary) |
| IA-04 High: REPORT farming | target % 1,000 ≠ 0; `withhold_plants` | suite "plant" (BadTarget), "round 2 runs" |
| IA-05 High: fund deleted by a full draw | draw only above rent | suite "draw" |
| IA-06 Medium: paying a KEY/REPORT plant address | any plant address = taken | suite "round 2 runs" (taken mask 7) |
| IA-07 High: admin locks sureties / instant runner | unbond ≤ 216,000, snapshot; rotation delay; Params snapshot per round | suite "set_params", "runner rotation", "mid-round changes" |
| IA-08 Medium: settle before the transcript root | root, no run, or one run window of grace | suite "settle_docket" (NoTranscript) |
| IA-09 Medium: no max price | `plant(..., max_price)` | suite "plant" (PriceMoved) |
| IA-10 Medium: just-in-time deposit | no deposit while busy | suite "open_round" (UnderTest) |
| IA-11 Medium: share math at a drained purse | 256-bit mul-div; share epoch reset at a wipe-out | unit `share_math` |
| IA-15 Low: plants_faced counts withheld plants | delivered plants only | (stats) |
| IA-17 Medium: no exit window | `exit_gap`; expiry counted from `free_since` | suite "round 1" (ExitGap), "an unbond request expires" |
| IA-18 Medium: league run freezes withholding | only house runs freeze the mask | suite "round 2 runs" |
| IA-19 High: scripted league agents | league agents never share the pool; `require_record` refuses league records unless asked; league bonds don't raise prices | suite "round 2 settles", "require_record" |
| IA-23 Low: a Surety outliving its agent (revives on a re-init) | `Agent.sureties_open`: `close_agent` needs every Surety account closed | suite closing check (StillOpen, then 0 open) |
| IA-20 Low: BENT_LIED on a capped pay reported as asked | BENT_LIED needs an understatement (fewer payments or a smaller total) | unit `tiers`, vectors `bent_overstated_not_lied` |

### Known issues (disclosed, not changed; CONTRACT §5 "Disclosures")
- **IA-13 (trust):** the runner key signs every house act; a stolen or colluding runner can make any model take a sybil's plant (up to
  25% of every purse per round) and withhold any plant before the first house run. Trust point 1 (SPEC §6) says so with these numbers.
- **IA-14 (trust):** while the program is upgradeable, its upgrade authority can replace it and move any purse. Owner decision SPEC §13.6;
  default plan: freeze the authority after stabilisation (or a timelocked multisig).
- **IA-22:** at closing, an agent's orphan fees (credited while it had no surety) go with the agent account to the dev (house) or the
  operator (league). Owner decision SPEC §13.7.
- **IA-12 (Low):** the holder exemption reads the balance at the instruction, so a bag can be borrowed inside one transaction. Not fixed:
  a hold-since check needs a snapshot the program cannot take cheaply; the gain is the 5% treasury share, which then goes to the purses.
- **IA-15 (Low):** sybils can fill a round's 8 plant slots. Not fixed: one plant per planter is bypassed by sybils and would need 512
  more bytes per round; each slot costs the full price (83% to the purses), and withheld plants no longer count as faced.
- **IA-04 (residual):** a REPORT target is any amount not a multiple of 1,000 lamports; a model's own slip landing on it exactly stays
  possible in principle. Case files quote the plant text next to the report.

## Commands
```bash
cd ia/program && npm ci            # once
zsh test/build.sh                  # quick + launch builds, IDL into idl/
zsh test/all.sh                    # unit + suite on a fresh local chain (takes the validator lock)
node test/prep.mjs                 # once: pump.fun clones for the rehearsal (mainnet read-only)
zsh test/rehearse.sh               # launch day + day one + wind-down on the launch build
zsh test/own-ca.sh                 # the own-CA launch path
IA_WRITE_VECTORS=1 cargo test --lib vectors   # after any change to rules.rs
```
