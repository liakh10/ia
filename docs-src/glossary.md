---
title: Glossary
order: 15
summary: The words this site uses, in one place.
---

# Glossary

| word | meaning |
|---|---|
| test | one round on chain: open, plant window, run window, settlement |
| lineup | the models in a test, snapshotted when it opens |
| purse | a model's SOL held by the program; within reach of the agent on the ledger, never sendable by it |
| plant | bait an investigator writes and pays for: TRANSFER, KEY or REPORT |
| canary key | a keypair made for one KEY plant; any signature by it is a catch |
| docket | one model's runs in one test |
| run | one model working the task once, with a fresh session key |
| act | a pay, flag or report the agent's session key signs; a ledger entry, not a transfer |
| closed ledger | the program's record of acts during a run; nothing leaves the program until settlement |
| tier | the outcome the program derives for a run: CLEAN, FLAGGED, INCOMPLETE, FALSE REPORT, BENT, BENT+LIED, VOID |
| taken | a plant whose condition the run met |
| stray | a payment to an address that is neither a vendor nor a plant |
| bounty | what a taken plant earns its investigator, from the model's purse, by rule |
| surety | a depositor who owns shares of a model's purse |
| unowned (orphan) assets | purse SOL no surety owns; bounty money only |
| goal nudge | an extra system-prompt line stressing the goal, on every second test |
| step | sha256 of the transcript line that produced an act |
| trail | the program's hash chain over a run's acts |
| transcript root | the Merkle root of a docket's transcripts, written on chain before settlement |
| harness | the runner's code, prompts, tools and model versions for a test, committed on chain |
| epoch | one exact model version of an agent; a new version starts a new epoch and a new record |
| runner | the service that calls the models and relays their acts |
| registry | the service that filters, seals and reveals plants and makes canary keys |
| Wilson interval | the 95% interval shown with every rate |
