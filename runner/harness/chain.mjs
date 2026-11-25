// The runner's client of the `ia` program (IDL ia/program/idl/ia.json): PDAs, account reads, the permissionless crank calls (open_round,
// close_empty_round, open_docket, settle_docket) and the runner's own calls (commit_harness, start_run, post_transcript), plus `act`
// signed by a run's session key with the runner key paying the fee (a session key never holds lamports).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import anchor from '@coral-xyz/anchor';

const { web3, BN } = anchor;
const { PublicKey, Keypair, Transaction, ComputeBudgetProgram } = web3;
const here = path.dirname(fileURLToPath(import.meta.url));
export const IDL_PATH = process.env.IA_IDL || path.resolve(here, '../../program/idl/ia.json');
export const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
export const big = x => BigInt(x.toString());

export const keypairFile = f => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, 'utf8'))));

export class Chain {
  /** @param {{ rpc: string, runner?: Keypair, wallet?: Keypair }} o  `wallet` pays the crank calls (defaults to the runner key). */
  constructor({ rpc, runner, wallet }) {
    this.conn = new web3.Connection(rpc, 'confirmed');
    this.runner = runner || null;
    this.wallet = wallet || runner || Keypair.generate();
    this.idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
    this.provider = new anchor.AnchorProvider(this.conn, new anchor.Wallet(this.wallet), { commitment: 'confirmed' });
    this.program = new anchor.Program(this.idl, this.provider);
    this.pid = this.program.programId;
    this.parser = new anchor.EventParser(this.pid, this.program.coder);
  }
  pda(...s) { return PublicKey.findProgramAddressSync(s, this.pid)[0]; }
  get config() { return this.pda(Buffer.from('config')); }
  get runnerFund() { return this.pda(Buffer.from('runner_fund')); }
  get treasury() { return this.pda(Buffer.from('treasury')); }
  agentPda(id) { return this.pda(Buffer.from('agent'), u16(id)); }
  roundPda(seq) { return this.pda(Buffer.from('round'), u64(seq)); }
  plantPda(seq, j) { return this.pda(Buffer.from('plant'), u64(seq), Buffer.from([j])); }
  docketPda(seq, id) { return this.pda(Buffer.from('docket'), u64(seq), u16(id)); }

  slot() { return this.conn.getSlot('confirmed'); }
  async waitSlot(s, poll = 300) { for (;;) { const now = await this.slot(); if (now > Number(s)) return now; await sleep(poll); } }
  fetchConfig() { return this.program.account.config.fetch(this.config); }
  fetchRound(seq) { return this.program.account.round.fetchNullable(this.roundPda(seq)); }
  fetchAgent(id) { return this.program.account.agent.fetch(this.agentPda(id)); }
  fetchDocket(seq, id) { return this.program.account.docket.fetchNullable(this.docketPda(seq, id)); }
  fetchPlant(seq, j) { return this.program.account.plant.fetchNullable(this.plantPda(seq, j)); }
  modelOf(agent) { return Buffer.from(agent.model).toString('utf8').replace(/\0+$/, ''); }

  /** Sends instructions with `feePayer` first signer; returns the signature after confirmation. */
  async send(ixs, signers, feePayer = signers[0]) {
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs);
    tx.feePayer = feePayer.publicKey;
    for (let attempt = 0; ; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.signatures = [];
        tx.sign(...signers);
        const sig = await this.conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        const r = await this.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        if (r.value.err) throw Error('tx failed: ' + JSON.stringify(r.value.err));
        return sig;
      } catch (e) {
        const s = String(e.message || e);
        if (attempt < 2 && /blockhash|timed out|429|ECONNRESET|fetch failed/i.test(s)) { await sleep(800); continue; }
        throw e;
      }
    }
  }
  /** A transaction's log lines by raw JSON-RPC (encoding "json", maxSupportedTransactionVersion 1): web3.js 1.98 cannot decode a
   *  version-1 transaction, and only the logs are needed here. Null while the transaction is not yet visible. */
  async txLogs(sig) {
    const res = await fetch(this.conn.rpcEndpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }] }),
    });
    const j = await res.json();
    if (j.error) throw Error('getTransaction: ' + (j.error.message || JSON.stringify(j.error)));
    return j.result ? (j.result.meta?.logMessages || []) : null;
  }
  async events(sig) {
    for (let i = 0; i < 40; i++) {
      const logs = await this.txLogs(sig);
      if (logs) return [...this.parser.parseLogs(logs)];
      await sleep(250);
    }
    return [];
  }

  // ---------------------------------------------------------------- permissionless crank calls
  async openRound(lineupIds) {
    const c = await this.fetchConfig();
    const seq = big(c.nextRound);
    const prev = seq > 0n ? this.roundPda(seq - 1n) : null;
    const ix = await this.program.methods.openRound().accountsPartial({
      payer: this.wallet.publicKey, config: this.config, prevRound: prev, round: this.roundPda(seq), slotHashes: SLOT_HASHES,
    }).remainingAccounts(this.lineupMetas(lineupIds)).instruction();
    const sig = await this.send([ix], [this.wallet]);
    return { seq, sig };
  }
  /** The lineup agents, writable (open_round marks them busy; close_empty_round frees them). */
  lineupMetas(ids) { return ids.map(id => ({ pubkey: this.agentPda(id), isWritable: true, isSigner: false })); }
  async closeEmptyRound(seq) {
    const r = await this.fetchRound(seq);
    const ix = await this.program.methods.closeEmptyRound().accountsPartial({ config: this.config, round: this.roundPda(seq) })
      .remainingAccounts(this.lineupMetas(Array.from(r.lineup.slice(0, r.lineupLen)))).instruction();
    return this.send([ix], [this.wallet]);
  }
  async openDocket(seq, agentId, payer = this.runner || this.wallet) {
    const ix = await this.program.methods.openDocket().accountsPartial({
      payer: payer.publicKey, config: this.config, round: this.roundPda(seq), agent: this.agentPda(agentId), docket: this.docketPda(seq, agentId),
    }).instruction();
    return this.send([ix], [payer]);
  }
  async settleDocket(seq, agentId, docketPayer) {
    const ix = await this.program.methods.settleDocket().accountsPartial({
      caller: this.wallet.publicKey, config: this.config, round: this.roundPda(seq), agent: this.agentPda(agentId),
      docket: this.docketPda(seq, agentId), payer: docketPayer, runnerFund: this.runnerFund,
    }).instruction();
    const sig = await this.send([ix], [this.wallet]);
    const ev = (await this.events(sig)).find(e => e.name.toLowerCase() === 'docketsettled');
    return { sig, event: ev && ev.data };
  }

  // ---------------------------------------------------------------- the runner's calls
  async commitHarness(seq, hash32) {
    const ix = await this.program.methods.commitHarness([...hash32]).accountsPartial({ runner: this.runner.publicKey, config: this.config, round: this.roundPda(seq) }).instruction();
    return this.send([ix], [this.runner]);
  }
  /** Marks plants the registry never delivered (bit j), before the round's first start_run: they can never be caught. */
  async withholdPlants(seq, mask) {
    const ix = await this.program.methods.withholdPlants(mask).accountsPartial({ runner: this.runner.publicKey, config: this.config, round: this.roundPda(seq) }).instruction();
    return this.send([ix], [this.runner]);
  }
  async startRun(seq, agentId, run, session) {
    const ix = await this.program.methods.startRun(run, session).accountsPartial({
      authority: this.runner.publicKey, config: this.config, round: this.roundPda(seq), agent: this.agentPda(agentId), docket: this.docketPda(seq, agentId),
    }).instruction();
    return this.send([ix], [this.runner]);
  }
  async postTranscript(seq, agentId, root32) {
    const ix = await this.program.methods.postTranscript([...root32]).accountsPartial({ authority: this.runner.publicKey, config: this.config, agent: this.agentPda(agentId), docket: this.docketPda(seq, agentId) }).instruction();
    return this.send([ix], [this.runner]);
  }
  /** One act signed by the run's session key (+ any extra signer the agent supplied); the runner pays the fee. Returns the Acted event. */
  async act(seq, agentId, run, session, step32, action, extra = []) {
    const ix = await this.program.methods.act(run, [...step32], action).accountsPartial({
      session: session.publicKey, round: this.roundPda(seq), docket: this.docketPda(seq, agentId),
    }).remainingAccounts(extra.map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: false }))).instruction();
    const sig = await this.send([ix], [this.runner, session, ...extra], this.runner);
    const ev = (await this.events(sig)).find(e => e.name.toLowerCase() === 'acted');
    return { sig, event: ev && ev.data };
  }
  encodeAction(action) { return encodeAction(action); }
}

/** borsh(Action) as the program hashes it into the trail (CONTRACT §4): variant u8, then the fields little-endian.
 *  Pay = 0 {source u8, to [32], amount u64}, Flag = 1 {target [32]}, Report = 2 {operating u64, reserve u64, payments u8, total u64}. */
export function encodeAction(a) {
  const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v.toString())); return b; };
  const key = k => new PublicKey(k).toBuffer();
  if (a.pay) return Buffer.concat([Buffer.from([0, a.pay.source]), key(a.pay.to), u64(a.pay.amount)]);
  if (a.flag) return Buffer.concat([Buffer.from([1]), key(a.flag.target)]);
  if (a.report) return Buffer.concat([Buffer.from([2]), u64(a.report.operating), u64(a.report.reserve), Buffer.from([a.report.payments]), u64(a.report.total)]);
  throw Error('unknown action');
}

export const pay = (source, to, amount) => ({ pay: { source, to, amount: new BN(amount.toString()) } });
export const flag = target => ({ flag: { target } });
export const report = (operating, reserve, payments, total) => ({ report: { operating: new BN(operating.toString()), reserve: new BN(reserve.toString()), payments, total: new BN(total.toString()) } });
export { web3, BN, PublicKey, Keypair };
