---
title: Trust points
order: 2
summary: Every party you trust, what it could do if it misbehaved, and what bounds it. Read this before anything else.
---

# Trust points

A trust point is a place where the system relies on a party behaving, because the chain alone cannot check it. Each one below says
what the party could do, what it cannot do, and what bounds the damage.

## 1. The runner relays model outputs faithfully, and its key signs every act

The runner makes and holds the session key of every house run, so its key stands behind every `act` a model makes. A stolen runner
key, or a runner that colludes with a planter, could make any model "take" a sybil's plant: up to 25% of every purse in every round
(the per-model cap on bounties), in public. It could also withhold any plant (so a real catch never counts) before the round's first
house run. Nobody can prove that a closed API's answer was not forged in between, so a dishonest runner could also make a clean model
look bent, or a bent model look clean.

What bounds it:

- Every request and response goes into the run's transcript with the provider's request id, and the transcript is published after the
  test settles.
- Each act carries `step = sha256(the transcript line that produced it)`, and the program chains the acts into a `trail`, so the
  transcript and the chain must agree line for line.
- The transcript's Merkle root is written on chain before settlement, so the runner cannot rewrite a transcript after seeing the outcome.
- The harness (prompts, tools, exact model versions, runs per docket, the goal nudge) is committed on chain before the plant window
  closes, as a reproducible hash.
- The open-weights model in the lineup runs with batch-invariant inference, so anyone can replay its runs bit for bit and catch a forged
  answer.
- Closed models are judged on rates over many runs, never on a single outcome.
- The catch cap: whatever the runner does, one test moves at most 25% of each purse, publicly.
- Withholding is public: the registry logs its delivery manifest at plant close, before the runner reads a single text, and the program
  records the withheld set (`PlantsWithheld`), so a withheld plant that was delivered shows up as a mismatch.
- The runner key cannot plant or deposit (checked on chain for its own key; a sybil key is the stated residual risk).
- A runner rotation waits about a day. It helps once a leak is noticed, not before.

A later phase runs the harness in an attested enclave, which removes most of this trust point. See [Phases](phases.md).

## 2. The registry keeps plants sealed until the runs

Plant texts go to the registry over TLS and stay sealed until the test settles. A registry that leaked them would let other
investigators copy a plant before the runs. It cannot alter a plant: the text's sha256 is on chain from the moment it is paid for, and
the reveal after settlement lets anyone re-hash it. A plant the registry never delivered is never shown to any model and cannot be
caught.

## 3. The admin and the upgrade authority

The admin key runs the program inside its rules, but while the program is upgradeable its upgrade authority (the dev wallet at launch)
can replace the program, and with it move any purse. The plan is to freeze the upgrade authority once the first weeks run clean, before
purses grow large (or to move it to a timelocked multisig); that is the owner's decision and still open. Until it is made, this page
says so. Whether the program is still upgradeable is public on chain: its upgrade authority is either a key or none.

Through the program's own instructions, the admin key can pause new tests, change parameters inside the program's hard caps (a test
runs under the parameters it opened with), schedule a lineup change or a runner rotation that takes effect only after a delay of about
a day, withdraw the treasury's 5% share to the dev wallet, and close the program, which pays every surety and every unclaimed bounty
out by rule.

It cannot move a purse, a plant's bounty or the runner fund except by those rules. No instruction moves purse lamports except
settlement (to plants), surety withdrawals (to the surety that owns the shares) and closing (to the same owners). One exception at
closing: fees credited to a purse while it had no surety belong to nobody, and they leave with the agent's account to whoever paid its
rent (the dev for a house agent, the operator for an Open League agent).

## 4. Model providers change models

Each agent account records an exact version string. A new version opens a new epoch with a fresh record, and the index reports per
version. A provider can still change a model behind a fixed name; rates over time per version make that visible but cannot prevent it.

## 5. The read API and this site

Every number on this site comes from the read API, which rebuilds everything from the program's events and replays every act and tier
from the published rules (any mismatch is listed on [Status](/status)). The API holds no keys and moves no funds. A wrong number there
is checkable against the chain with the SDK; a case file checks its own transcript in your browser.

## 6. The log

The transparency log signs its tree heads with its own key and anchors transcript roots on chain. A log that dropped or rewrote an entry
would fail an inclusion or consistency proof against a head it signed earlier, and the on-chain roots would disagree with it.

## 7. Known issues we accept

The internal audit found three small weaknesses that stay unfixed by choice. Each is public in the
[program's test report](/reports/program).

- **Borrowed $IA for the holder exemption.** The program reads a planter's $IA balance at the moment of the plant, so a bag can be
  borrowed inside one transaction. The gain is the 5% treasury share, which then goes to the purses instead of the treasury.
- **Sybils can fill a test's plant slots.** One planter with many wallets can take all 8 slots. Each slot costs the full price (83% of
  it goes to the purses), and a withheld plant does not count as faced.
- **A REPORT target can match an honest slip.** A REPORT plant's target is any amount that is not a multiple of 1,000 lamports, so no
  task number can equal it, but a model's own arithmetic slip landing on it exactly stays possible in principle. Case files quote the
  plant text next to the report, so you can judge it.
