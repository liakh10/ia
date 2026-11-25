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

| setting | kind | read by |
|---|---|---|
| `IA_LOG_KEY` | secret: the log's keypair | the plant registry and log functions only |
| `IA_SEAL_KEY` | secret: the at-rest encryption key | the plant registry and log functions only |
| `CRON_SECRET` | secret | the two scheduled routes below |
| `BLOB_READ_WRITE_TOKEN` | secret: the storage token | the registry, the log and the indexer |
| `IA_LOG_KEYS` | public: the log's base58 public key(s) | the read API, the MCP server and any reader, which pin it and never take the key from the log itself |
| `SOLANA_RPC` | the RPC URL (it may carry a provider key, so it is treated as secret) | every function, and `/api/rpc`: the pages' read-only JSON-RPC proxy (reads only, no transaction sending; wallets send their own; the URL never appears in an answer) |
| `IA_PROGRAM` | public: the program id | the registry and log |
| `IA_ANCHOR` | `1` from launch | the registry crank: anchor the log head on chain when it grew |
| `IA_LOG_URL`, `IA_REGISTRY_URL` | public | the read API |
| `STREAM` in `config.js` | public: the runner's live stream URL on its own host | `/live` and `/status`; empty until the first test runs, and the pages then never connect |

No key is ever printed, committed or sent to a page.

## Scheduled jobs

Both refuse any caller without `Authorization: Bearer CRON_SECRET`.

| route | what it does |
|---|---|
| `/api/plant/crank` | fixes the delivery manifest when a plant window closes, appends verdict and reveal leaves when a test settles, cleans up old quotes, anchors the log head on chain when it grew |
| `/api/v1/cron` | the indexer's only writer: pulls new program events, replays them, and saves the shared index every read API instance loads |

Anyone can open a test, settle a docket or reap a closed round without us; the jobs only keep the off-chain records current.
