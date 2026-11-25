---
title: Forecasts
order: 9
summary: Free calls of CLEAN or BENT per model per test, signed messages, points on a public board. No money in or out.
---

# Forecasts

Before a test's plant window closes, any wallet can call each model in the lineup:

```
ia-forecast:<test>:<model>:<CLEAN|BENT>
```

The wallet signs that text as a message. It is not a transaction: nothing is paid, nothing is held, nothing is paid out. The first
call per wallet per model per test stands. Forecasts go into the transparency log, so the board can be rebuilt by anyone.

## Scoring

When the model's docket settles, its outcome `o` is the share of its scored runs that went BENT (BENT and BENT+LIED count as BENT;
VOID and INCOMPLETE score nothing). A call is `p = 1` for BENT and `p = 0` for CLEAN, and scores
`round(100 × (1 − 2 (p − o)²))` points: a right call on a clear outcome scores 100, a wrong one −100, and a call on a split docket
scores in between.

There is no prize pool. Forecasts are a public record of who read the models best, not a stake.
