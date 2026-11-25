---
title: Threat model of the verifier
order: 11
summary: The plant registry, the transparency log and the replay kit, threat by threat, with the test that proves each mitigation.
---
# Threat model: the verifier (plant registry, transparency log, replay kit)

Scope: `ia/registry/`, `ia/log/`, `ia/replay/`, `ia/api/plant/*`, `ia/api/log/*` (CONTRACT §7–§8). The program, the runner and
the adapters have their own models (`ia/audit/`); where a threat crosses a boundary it is listed here with the owner of the other half.
Every mitigation names the test that proves it (`registry/test/*.test.mjs`, `registry/test/e2e/local-e2e.mjs`).

## What the verifier holds and promises

| asset | promise | where |
|---|---|---|
| plant texts and canary seeds before the reveal | nobody reads them before the plant window closes; only the runner (signed) before settlement; everybody after | sealed store, runner feed, reveal |
| the delivery decision | fixed once at plant close, logged before any run, never changed | MANIFEST leaf, create-if-absent records |
| transcripts | committed (root in the log and on chain) before settlement, published after, never altered | TRANSCRIPT leaf, `post_transcript` |
| the log | append-only, one history for everyone, anchored on chain | RFC 9162, signed heads, memo anchors, witnesses |
| verdict evidence | anyone can recompute a case's tier from public data | VERDICT leaf, replay kit |
| keys | the log key signs heads and pays memo fees; the seal key encrypts the store | `~/.config/ia/` (600) or Vercel env |

## Trust points (stated first, as on /docs)

1. **The registry operator (us) could leak a plant before the run.** A leak lets someone copy a plant; it cannot change one (the hash is on
   chain at plant time). Bounded by: texts are sealed at rest with AES-256-GCM, never logged, never returned by any public route before
   `RoundSettled`; the runner gets them only after plant close, through a signed request.
2. **The registry operator could refuse to deliver a paid plant.** Bounded by: the delivery rule is mechanical (a quote with that hash,
   class, target, canary and, for `{{PLANT}}`, index), the MANIFEST leaf with every plant's decision is logged and anchored before the
   first run, and the program clears undelivered plants from the taken masks (`withhold_plants`) so the runner cannot quietly drop a plant
   and still settle it as "not taken" without the public seeing it. The replay kit checks `Round.withheld` = the manifest's undelivered set.
   Residual: a planter whose plant was wrongly marked undelivered has no on-chain remedy; the evidence (quote receipt with `textHash`,
   the manifest entry) is public, and the fee was split like any other plant's.
3. **The runner relays model outputs faithfully** (SPEC trust point 1; owner: runner). The verifier narrows it: every act's `step` must be
   the hash of a `tool_call` entry in the committed transcript with the same arguments, the trail must recompute, every `get_balance`
   answer must equal the ledger at that moment, the inbox must equal `runner/task` byte for byte, and the open-weights model's every call
   must replay bit for bit on a batch-invariant endpoint. A forged closed-API answer that is self-consistent is still undetectable; rates
   over N runs (`replay rates`, `replay env`) are the only check there.
4. **The log operator (us) could show different histories to different people.** Bounded by signed heads, consistency proofs, memo
   anchors that fix a head to a slot, and witnesses that cosign only extensions of what they saw (`cosignHead`).

## Threats

| id | threat | actor | mitigation | proof |
|---|---|---|---|---|
| V-01 | read a plant text before plant close (to copy or pre-empt it) | anyone, other planters | no public route returns a text before settlement; the feed checks `slot ≥ plant_close` and the runner's signature; the store holds ciphertext only (key name as AAD, so a blob moved to another key does not open) | registry.test "quotes … texts rest sealed", "delivery … feed" (401/403/stale/other path); e2e feed check |
| V-02 | replay a captured runner request | network attacker | TLS; the signed text binds method, path, time (±300 s) and sha256(body); a GET for another seq or a POST with another body fails | registry.test (signature for another path → 401) |
| V-03 | a runner key that is not the runner | anyone | the key must equal `Config.runner` read from chain at request time (rotation follows the program's delay) | registry.test (another key → 403) |
| V-04 | change a plant after paying | planter | the hash is on chain; delivery needs the same hash; the reveal re-hashes | registry.test, e2e (text hashes to the on-chain hash) |
| V-05 | plant a hash, then quote a matching text late to get it delivered | planter | quotes close at plant close; the manifest is created once (create-if-absent) and later quotes change nothing | registry.test "a quote arriving later changes nothing" |
| V-06 | quote text for index j, land at another index | planter racing another planter | a `{{PLANT}}` text binds its index (the program refuses the stale PDA; the registry refuses delivery at another index) | registry.test "names another plant address" |
| V-07 | KEY canary reuse or a planter-chosen canary | planter | the registry mints the canary; delivery requires the on-chain canary = the quoted one; the program refuses a duplicate canary in a round | registry.test (canary match), program suite |
| V-08 | harmful content in a plant (CBRN, malware, weapons, attack planning, self-harm) | planter | filter `ia-filter-1` before payment; texts are never in log leaves (only hashes), and a text that slipped through can be withheld with a public REDACTION leaf | registry.test filter table; redaction test |
| V-09 | real-world targets (real people, companies, URLs, e-mail, phones, handles, outside chain addresses, card/IBAN numbers) | planter | the same filter; only RFC 2606 names and this round's own addresses (vendors, decoys, plant PDAs, canary) may appear | registry.test filter table |
| V-10 | filter bypass by paraphrase, other languages, encodings | planter | **residual**: keyword rules miss paraphrases. Mitigations: NFKC normalisation, bidi/control characters refused, the 1,024-byte cap, a public reveal (the community sees every text), redaction. Phase 2: a second, model-based classifier behind the adapters' budget guard | — |
| V-11 | store spam through quotes | anyone | 20/min per client per instance, 60 per 10 min across instances (HMAC'd client ids, no raw IPs stored), 5,000 quotes per round; quotes deleted after the manifest | registry.test rate limit |
| V-12 | the log rewritten or forked | log operator, a compromised function | append = create-if-absent of the next index (no overwrite path exists); heads are signed; anchors on chain; witnesses refuse a shrink or a fork | log.test (two instances, no gap; cosign refuses fork/shrink) |
| V-13 | the same record logged twice with different content | a retried or racing crank | `appendOnce(key)` marker: same leaf → same index, other leaf → 409; a stale marker is resolved by finding the leaf | log.test appendOnce |
| V-14 | a forged `ia` event in a transaction log | a program the transaction also calls | events are read only where `ia` is the innermost running program; accounts are read with an owner check | contract.test (a CPI'd program's line is ignored) |
| V-15 | transcript swapped after the verdict | runner, us | the run root and file hash are logged at close, the docket root goes on chain by `post_transcript` and is repeated in `DocketSettled`; the replay compares all three | replay.test, e2e "edited after the fact" |
| V-16 | transcript lines that hash differently than they read (whitespace, key order) | runner | each line must equal its own RFC 8785 form; `i` must equal the line number | log.test, registry.test |
| V-17 | the runner drops a plant from the inbox | runner | replay: every delivered plant's text must be in `read_inbox`, and with `--task` the inbox must equal `runner/task` exactly | replay.test, e2e |
| V-18 | the runner answers `get_balance` with a wrong number (to push a model toward the reserve) | runner | replay checks every answer against the replayed ledger | replay.test "a get_balance answer" |
| V-19 | key theft | outside attacker | keys live in `~/.config/ia` (dir 700, files 600) or Vercel env; the keys script prints public keys only and sends values to Vercel through stdin; the log key holds only fee SOL; the seal key protects texts only until the public reveal | build.test keys |
| V-20 | a log key compromise | outside attacker | the attacker can sign heads; anchors and witnesses expose any fork from the published history; rotation = a new key announced in the log and on /docs (manual) | log.test cosign |
| V-21 | a different bundle than the published one | us, Vercel | `registry/dist/BUILD.json` pins the bundle hash (inputs only from the verifier's folders and the lockfile, IDL inlined); Vercel builds with `build:verify`; MANIFEST leaves carry the running bundle's hash | build.test |
| V-22 | the IDL drifts from the program | program changes | the bundle decodes from its committed IDL copy (`npm run sync-idl`); the e2e runs against the program's current build | e2e |
| V-23 | open-weights replay passes on a different model | us | the replay resends the exact recorded request (model id included) and requires the identical message; the endpoint's own model hash is the operator's statement (phase 2: attested) | replay.test, e2e |
| V-24 | a closed API gives a different answer on replay | provider | expected (nondeterminism); only rates are compared (Wilson, Fisher exact), never single runs | replay.test stats |
| V-25 | anchoring stops (no SOL on the log key) | operations | anchors are optional for correctness (heads are signed); `/api/log/anchors` and /status show the last anchor's age | — |
| V-26 | personal data in the store | — | no IPs (HMAC'd per window, swept), no wallet links beyond what the chain already shows (forecast signer) | limits.ts |

## Not covered here
- The program's own rules and accounts (audit IA-NN findings), sybil planters (bounded by price), runner collusion with a planter (SPEC §8),
  geo-blocking (site/API layer), provider ToS.
