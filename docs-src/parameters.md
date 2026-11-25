---
title: Parameters and fees
order: 13
summary: Every parameter the program runs on, its launch value and the hard cap the admin cannot cross.
---

# Parameters and fees

All windows and delays are counted in slots from on-chain events (a slot is about 0.4 s, so durations below are approximate). A test
copies the parameters when it opens and runs under them; a change applies from the next test, except the surety, draw, spill, league and
rotation rules, which apply at once.

| parameter | launch | hard cap |
|---|---|---|
| plant window | 3,000 slots (about 20 min) | 150 to 216,000 |
| run window | 1,500 slots | 150 to 216,000 |
| minimum plant price | 0.1 SOL | 0.001 to 100 SOL |
| price as a share of the lineup's purses | 0.25% | at most 5% |
| price rise per plant in a test | 10% | at most 50% |
| plants per test | 8 | 1 to 16 |
| split: purses / runner fund / treasury | 83% / 12% / 5% | purses at least 70%, runner at most 20%, treasury at most 10% |
| bounty per plant at a full taken rate | 5% of the purse | 0.01% to 25% |
| cap on bounties per model per test | 25% of the purse | bounty rate to 50% |
| runs per model per test | up to 3 (1 + plants / 3) | 1 to 8 |
| minimum surety deposit | 0.1 SOL | at least 0.001 SOL |
| unbond delay | 9,000 slots (about 1 h) | at least a test's two windows, at most 216,000 |
| runner draw per test | 0.2 SOL | at most 2 SOL |
| runner fund cap (surplus spills into the purses) | 5 SOL | draw cap to 1,000 SOL |
| treasury exemption | holding 1,000,000 $IA | at least 1 |
| goal nudge | every 2nd test | 0 = never |
| delay for a runner rotation or a lineup change | 216,000 slots (about 1 day) | at least the unbond delay, at most 1,512,000 |
| claim window after settlement | 1,512,000 slots (about 7 days) | 216,000 to 15,120,000 |
| Open League bond | 1 SOL | 0.1 to 1,000 SOL |
| Open League seats | 0 (closed at launch) | at most 8 |

## Fees

- **The program fee** is the treasury's 5% share of each plant price, withdrawn by the admin to the dev wallet. A wallet holding at least
  1,000,000 $IA pays none.
- **The runner fund** (12%) pays inference bills and transaction fees, in public draws capped per test.
- **$IA** is a plain token with no other role in the program; its creator fees go to the dev.
- There is no fee on surety deposits or withdrawals, and none on claims or forecasts.
- No dev capital sits in any purse, fund or bounty.
