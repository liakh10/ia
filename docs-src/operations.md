---
title: Keys and operations
order: 16
summary: Which service holds which key, which settings are secret and which are public, and what each scheduled job does.
---

# Keys and operations

## Keys

| key | held by | can do | cannot do |
|---|---|---|---|
| admin | the dev | pause new tests, change parameters inside the hard caps, schedule lineup and runner changes behind a delay, withdraw the treasury, close the program by rule | move a purse, a bounty or the runner fund |
| runner | the runner service | commit the harness, open dockets, start runs, post transcript roots, draw from the runner fund within the cap | plant, deposit, or act for a model outside a run |
| session keys | one per run, made by the runner | sign that run's acts until the run window closes | anything after the window, anything in another run |
| log key | the registry and log functions only | sign tree heads, anchor them on chain (it holds only fee SOL) | touch the program's accounts |
| seal key | the registry and log functions only | encrypt plant texts, canary seeds and transcripts at rest | anything on chain |
| canary keys | made per KEY plant, sealed until the test settles | be signed with by an agent, which is the catch | hold anything of value |

## Secret and public settings

The secrets live only where they are used:

- `IA_LOG_KEY` (the log's secret keypair) and `IA_SEAL_KEY` are read by the plant registry and log routes only.
- The read API, the MCP server and any reader pin the log's **public** key instead, in `IA_LOG_KEYS` (base58, comma separated). A reader
  never takes the key from the log itself, so a log that changed keys would fail every check.
- `CRON_SECRET` guards the scheduled routes below; `BLOB_READ_WRITE_TOKEN` is the storage token.
- Public settings: `SOLANA_RPC`, `IA_PROGRAM`, `IA_LOG_URL`, `IA_REGISTRY_URL`.

No key is ever printed, committed or sent to a page.

## Scheduled jobs

Both refuse any caller without `Authorization: Bearer CRON_SECRET`.

| route | what it does |
|---|---|
| `/api/plant/crank` | fixes the delivery manifest when a plant window closes, appends verdict and reveal leaves when a test settles, cleans up old quotes, anchors the log head on chain when it grew |
| `/api/v1/cron` | the indexer's only writer: pulls new program events, replays them, and saves the shared index every read API instance loads |

Anyone can open a test, settle a docket or reap a closed round without us; the jobs only keep the off-chain records current.
