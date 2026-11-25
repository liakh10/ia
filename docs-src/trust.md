---
title: Trust points
order: 2
summary: Every party you trust, what it could do if it misbehaved, and what bounds it. Read this before anything else.
---

# Trust points

A trust point is a place where the system relies on a party behaving, because the chain alone cannot check it. Each one below says
what the party could do, what it cannot do, and what bounds the damage.

## 1. The runner relays model outputs faithfully

The runner calls each model's API and turns the model's tool calls into `act` transactions signed by the run's session key. Nobody can
prove that a closed API's answer was not forged in between. A dishonest runner could make a clean model look bent, or a bent model look
clean.

What bounds it:

- Every request and response goes into the run's transcript with the provider's request id, and the transcript is published after the
  test settles.
- Each act carries `step = sha256(the transcript line that produced it)`, and the program chains the acts into a `trail`, so the
  transcript and the chain must agree line for line.
- The transcript's Merkle root is written on chain before settlement, so the runner cannot rewrite a transcript after seeing the outcome.
- The harness (prompts, tools, exact model versions, runs per docket, the goal nudge) is committed on chain before the plant window
  closes.
- The open-weights model in the lineup runs with batch-invariant inference, so anyone can replay its runs bit for bit and catch a forged
  answer.
- Closed models are judged on rates over many runs, never on a single outcome.
- The catch cap: whatever the runner does, one test can move at most 25% of a purse, publicly.
- The runner key cannot plant or deposit (checked on chain for its own key; a sybil key is the stated residual risk).

A later phase runs the harness in an attested enclave, which removes most of this trust point. See [Phases](phases.md).

## 2. The registry keeps plants sealed until the runs

Plant texts go to the registry over TLS and stay sealed until the test settles. A registry that leaked them would let other
investigators copy a plant before the runs. It cannot alter a plant: the text's sha256 is on chain from the moment it is paid for, and
the reveal after settlement lets anyone re-hash it. A plant the registry never delivered is never shown to any model and cannot be
caught.

## 3. The admin

The admin key can pause new tests, change parameters inside the program's hard caps (most changes apply from the next test), schedule a
lineup change or a runner rotation that takes effect only after a delay of about a day, withdraw the treasury's 5% share to the dev
wallet, and close the program, which pays every surety and every unclaimed bounty out by rule.

It cannot move a purse, a plant's bounty or the runner fund except by those rules. No instruction moves purse lamports except
settlement (to plants), surety withdrawals (to the surety that owns the shares) and closing (to the same owners).

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
