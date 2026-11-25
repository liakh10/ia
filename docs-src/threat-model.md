---
title: Threat model
order: 10
summary: Who could attack what, and what stops them. The internal audit's findings are published in the test reports.
---

# Threat model

| attacker | goal | what stops it |
|---|---|---|
| the runner | forge a model's answer to make it look clean or bent | step hashes per act, transcript roots on chain before settlement, published transcripts with provider request ids, open-weights replays, rates over runs; the catch cap bounds any single test at 25% of each purse ([trust point 1](trust.md#1-the-runner-relays-model-outputs-faithfully-and-its-key-signs-every-act)) |
| the runner key (stolen or colluding) | make models take a sybil's plants, or withhold a real one | up to 25% of every purse per round, in public; withholding only before the round's first house run, checked against the registry's delivery manifest; rotation after a delay ([trust point 1](trust.md#1-the-runner-relays-model-outputs-faithfully-and-its-key-signs-every-act)) |
| the runner | plant its own bait and collect bounties | the runner key cannot plant or deposit (checked on chain); sybil keys remain the stated residual risk, bounded by the cap and visible in the transcripts |
| the registry | leak plants early, or swap a text | a leak only lets others copy; a swap fails the on-chain hash; the reveal lets anyone re-hash |
| an investigator | spam the inbox | a price that rises 10% per plant, at most 8 plants per test, the filter before payment |
| an investigator | void a run by telling the agent to refuse | an INCOMPLETE run pays nobody and refunds nothing |
| an investigator | farm honest arithmetic errors with REPORT plants | a REPORT plant is caught only on its exact target, which must differ from the truth and is never a multiple of 1,000 lamports (a slip landing on it exactly stays possible: [known issues](trust.md#7-known-issues-we-accept)) |
| a surety | deposit after seeing the bait, or leave before a catch | no deposit or withdrawal while the model is under test; the unbond delay is longer than a test |
| the admin | drain a purse | no instruction lets the admin move a purse; lineup and runner changes wait out a delay; parameter changes stay inside hard caps and apply from the next test |
| the upgrade authority | replace the program and move any purse | nothing in the program while it is upgradeable: stated as [trust point 3](trust.md#3-the-admin-and-the-upgrade-authority); the plan is to freeze it after the first weeks (owner decision, open) |
| a model provider | change the model behind a name | exact version strings, epochs per version, rates over time |
| a caller | settle a docket twice, or re-open it | refused by the program (audit finding IA-01, fixed and tested on a local validator) |
| anyone | make a counter lie | every counter is SOL in a program account or a run outcome the program derived |

## Out of scope, stated

- A closed model's provider could serve different weights to us than to others. We measure what the API served us.
- A runner key holder with many sybil wallets can plant against its own runs; the cap bounds the take, the transcripts show the runs.
- Rates are not production rates; see [Methodology](methodology.md#limits-stated).

The plant registry, the transparency log and the replay kit have their own threat model, threat by threat with the test that proves
each mitigation: [Threat model of the verifier](threat-model-verifier.md). The internal audit (findings with severity, the fix and
the test that proves it) is published with the [test reports](/reports).
