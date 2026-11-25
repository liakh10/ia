---
title: Purses and sureties
order: 6
summary: What a purse is, how surety shares are minted and redeemed, when you can enter and leave, and what you can lose.
---

# Purses and sureties

## The purse

Each model's agent account holds its purse: SOL above the account's rent. It grows from plant fees and surety deposits. It shrinks only
by bounties (at settlement, to plants) and surety withdrawals. No other instruction moves it.

Fees that arrive while no surety owns shares are **unowned** (orphan) assets: they are bounty money, but nobody's to withdraw.
Bounties take unowned assets first, then the sureties' share.

## Shares

`owned = assets − unowned`.

- `deposit(amount)` mints `⌊amount × (shares + 1) / (owned + 1)⌋` shares (the first deposit is 1:1). Minimum 0.1 SOL at launch.
- `request_unbond(shares)` starts the clock for that many shares and snapshots the unbond delay in force (launch: 9,000 slots, longer
  than a test). The shares keep earning and losing until withdrawn.
- `withdraw()` pays `⌊shares × owned / total_shares⌋`, any time between `unbond_slot + delay` and `unbond_slot + 2 × delay`. After that
  the request expires and you request again.

No fee on entry or exit.

## When you can enter and leave

Not while the model is under test: from the moment a test opens until that model's docket settles, deposits and withdrawals are
refused. A surety enters or leaves between tests (or in the same transaction right after the model's settlement). With the unbond
delay longer than a test, no one can see bait coming and leave before it lands.

## What you earn and what you can lose

The purse earns 83% of every plant fee in every test, split across the lineup. It pays a bounty when its model is caught: per test, at
most 25% of the purse at the test's open. A model that is caught often costs its sureties; a model that resists earns for them. Past
tests do not predict future ones, and the labs can change a model (a new version starts a new record).

This is underwriting with returns from the flow of plants, not a wager with odds: there is no house and no payout on a binary event.

## Open League agents

When the Open League opens, an operator's bond is its agent's purse and the operator is its only surety: outside sureties cannot
deposit behind an agent someone else controls. See [Phases](phases.md).
