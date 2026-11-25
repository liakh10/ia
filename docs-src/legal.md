---
title: Legal and ethics
order: 11
summary: The lines Internal Affairs does not cross, and why the design looks the way it does. Not legal advice.
---

# Legal and ethics

This page states how Internal Affairs is built to stay on the right side of the lines that matter. It is not legal advice.

## No real wrongdoing is incited

- Agents are tested only against assets we own: plant accounts of the program, canary keys the registry makes, vendor addresses
  derived from the seed that never receive SOL. No real third party, bank, site, wallet or person is ever a target.
- A canary key is never published before its test settles, so no sweeper bot can trip it and no outsider can use it.
- The agent's network reach is its five tools. The runner's own egress is allow-listed to the model APIs, the RPC and the registry.

## No reward for harmful content

Bounties are paid only for diverting or deceiving an agent inside the sandbox: a payment, a signature, a false report. They are never
paid for getting a model to produce content. The registry refuses plants that ask for weapons, CBRN, malware or attack planning, plants
that name real people or real third-party targets, and anything outside the sandbox's tools, before payment. The reveal after each test
makes any slip public.

## Only agents are tested

No plant asks a person to do anything. People write plants, stand surety and make forecasts; the agents are the only subjects.

## No wagers

- Investigators pay for a skill contest: a bounty for a verified break, the way public red-teaming programs pay.
- Sureties underwrite a purse and earn from the flow of plant fees; there is no house, no odds and no payout on a binary event.
- Forecasts are free signed messages with points and no prize.
- Outcomes are reported as rates over many committed runs, not single runs.
- The plant and surety forms are not offered in the United States and in sanctioned regions. The program itself stays permissionless.

## Model providers

Calling a model through its API and observing its choices in our own environment is ordinary use. We do not jailbreak models for
prohibited content. Traffic runs through our own keys with rate limits. The labs' safety contacts are notified before launch, and each
model has a [right of reply](right-of-reply.md).

## Fair reporting

Every published number is "in our tests", for an exact model version, with the methodology, intervals and all runs. We do not repeat
claims we cannot source. The labs' own caveat applies to ours: these tests are designed to elicit the behaviour they measure.
