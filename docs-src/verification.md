---
title: Verification
order: 8
summary: Transcripts, step hashes, the act trail, Merkle roots, the transparency log and replays. How to check a case yourself.
---

# Verification

## The transcript

Each run has one JSON Lines file, one canonical JSON object per line (keys sorted, no spaces, RFC 8785 style). The first line is
`meta`: the test, model, run, session key, harness hash, scenario, nudge, inbox order and plant indexes. Then every `system`, `user`,
`assistant`, `tool_call` and `tool_result` entry, with the provider, the exact model string and the provider's request id.
Transcripts are published only after the test settles, so plants stay sealed until then.

## From transcript to chain

1. **Step.** Each act carries `step = sha256(the tool_call line that produced it)`.
2. **Trail.** The program chains `trail = sha256(trail ‖ step ‖ action)` from 32 zero bytes; the final trail is in the settlement event.
3. **Run root.** The RFC 9162 Merkle tree head over the run's lines: `leaf = sha256(0x00 ‖ line)`, `node = sha256(0x01 ‖ left ‖ right)`.
4. **Docket root.** The same tree over the docket's run roots, in run order, posted on chain before settlement.

A runner that changed a transcript after the fact would break the docket root on chain; one that relayed an act the model never asked
for would need a transcript line whose hash is that act's step.

## Check a case yourself

Every case file runs these checks in your browser. To run them yourself:

```js
// node 20+: verify one docket against the chain's transcript root
import crypto from 'node:crypto';
const sha = b => crypto.createHash('sha256').update(b).digest();
function mth(leaves) {
  if (leaves.length === 0) return sha(Buffer.alloc(0));
  if (leaves.length === 1) return sha(Buffer.concat([Buffer.from([0]), leaves[0]]));
  let k = 1; while (k * 2 < leaves.length) k *= 2;
  return sha(Buffer.concat([Buffer.from([1]), mth(leaves.slice(0, k)), mth(leaves.slice(k))]));
}
const api = 'https://<this site>/v1';
const id = '12-3-0';                                   // <test>-<model>-<run>
const c = await (await fetch(`${api}/cases/${id}`)).json();
const round = await (await fetch(`${api}/rounds/${c.round}`)).json();
const docket = round.dockets.find(d => d.agent === c.agent);
const roots = [];
for (const r of docket.runs.filter(r => r.session)) {
  const text = await (await fetch(`${api}/cases/${r.case}/transcript`)).text();
  const lines = text.split('\n').filter(Boolean).map(l => Buffer.from(l));
  if (r.run === c.run) for (const a of c.acts) if (!lines.some(l => sha(l).toString('hex') === a.step)) throw Error('act ' + a.act + ' has no line');
  roots.push(mth(lines));
}
console.log(mth(roots).toString('hex') === c.transcriptRoot ? 'docket root matches the chain' : 'MISMATCH');
```

The `@ia/sdk` package does the same with `transcriptRoot` and `docketRoot`, and replays the tiers from the ledger.

## The transparency log

An append-only RFC 9162 log holds every transcript root, every plant reveal, every harness manifest and every forecast. The log key
signs each tree head; the API serves inclusion and consistency proofs; independent witnesses can cosign heads. See [Log](/log).

## Replays

- **Open weights:** the lineup's open-weights model runs with batch-invariant deterministic inference. Each `assistant` entry carries
  the exact request, so anyone with the weights can resend it and get the same tokens.
- **Closed APIs:** not bit-reproducible. The environment is: every tool result is a function of the seed and the ledger. Compare
  **rates** over many runs, never one run.

## The indexer replay

The read API rebuilds everything from program events and replays every act and tier from the published rules. Any disagreement with
the chain is listed on [Status](/status).
