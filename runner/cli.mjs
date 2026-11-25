#!/usr/bin/env node
// The runner's command line.
//   node runner/cli.mjs keygen                      make ~/.config/ia/runner.json (chmod 600) if absent; prints the public key only
//   node runner/cli.mjs crank [--once]              the loop (open → commit → run → settle); without the runner key only the
//                                                   permissionless half (open, close empty, settle)
//   node runner/cli.mjs commit <seq> | run <seq> | settle <seq>
//   node runner/cli.mjs task <seq>                  print the round's task (numbers, template, documents without plants) from chain
// Env: IA_RPC (default http://127.0.0.1:54899), IA_RUNNER_KEY (default ~/.config/ia/runner.json), IA_WALLET (crank payer when not the
// runner), IA_STREAM_PORT (serve the live stream), IA_SERVICES_URL (registry + log), IA_DATA, IA_BUDGET_USD. Never mainnet keys here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installEgress } from './lib/egress.mjs';
import { Chain, keypairFile, Keypair } from './harness/chain.mjs';
import { crank, commitFor, runTest, settleRound } from './round.mjs';
import { buildTask } from './task/index.mjs';
import { serveStream, publish } from './lib/stream.mjs';

const [cmd, arg] = process.argv.slice(2);
const keyPath = process.env.IA_RUNNER_KEY || path.join(os.homedir(), '.config/ia/runner.json');

if (cmd === 'keygen') {
  if (fs.existsSync(keyPath)) { console.log('exists: ' + keypairFile(keyPath).publicKey.toBase58()); process.exit(0); }
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log('runner key made: ' + kp.publicKey.toBase58());
  process.exit(0);
}

if (!['crank', 'commit', 'run', 'settle', 'task'].includes(cmd)) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0); }
const rpc = process.env.IA_RPC || 'http://127.0.0.1:54899';
installEgress([new URL(rpc).hostname, ...(process.env.IA_SERVICES_URL ? [new URL(process.env.IA_SERVICES_URL).hostname] : [])]);
const runner = fs.existsSync(keyPath) ? keypairFile(keyPath) : null;
const wallet = process.env.IA_WALLET ? keypairFile(process.env.IA_WALLET) : runner;
if (!wallet) { console.error('no runner key and no IA_WALLET: nothing can pay the crank'); process.exit(2); }
const chain = new Chain({ rpc, runner, wallet });
let emit;
if (process.env.IA_STREAM_PORT) { const s = await serveStream({ port: Number(process.env.IA_STREAM_PORT) }); console.log('stream: ' + s.url); emit = publish; }
const seq = arg !== undefined ? BigInt(arg) : null;
const show = x => console.log(JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));

switch (cmd) {
  case 'crank': await crank(chain, { once: process.argv.includes('--once'), params: undefined, emit }); break;
  case 'commit': show(await commitFor(chain, seq)); break;
  case 'run': show(await runTest(chain, seq, { emit })); break;
  case 'settle': show((await settleRound(chain, seq)).map(s => ({ agent: s.agent, tiers: s.tiers }))); break;
  case 'task': { const r = await chain.fetchRound(seq); const t = buildTask({ seed: Buffer.from(r.seed) }); show({ template: t.templateId, numbers: t.numbers, decoys: t.decoys, docs: t.docs }); break; }
}
process.exit(0);
