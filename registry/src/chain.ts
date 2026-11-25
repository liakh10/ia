/* The verifier's read view of the `ia` program: config, rounds, plants, and the events of transactions that touched a round or a
   docket. One interface (IaChain) so tests use a double and production uses RPC. Read-only: the only transaction the verifier
   ever sends is the log key's memo anchor (log/src/anchor.ts). */
import { IaError, fromB58, toB58, u16le, u64le, text } from '../../log/src/codec.js';
import { findProgramAddress, type Rpc } from '../../log/src/rpc.js';
import { decodeAccount, eventsFromLogs } from './idl.js';

export interface IaEvent { name: string; data: any; signature: string; slot: number; blockTime: number | null }
export interface IaChain {
  programId: string;
  slot(): Promise<number>;
  config(): Promise<any | null>;
  round(seq: bigint): Promise<any | null>;
  plants(seq: bigint, count: number): Promise<(any | null)[]>;
  /** ia events of every transaction that touched this address, oldest first */
  events(address: string): Promise<IaEvent[]>;
}

export const pdas = (programId: string) => {
  const pid = fromB58(programId);
  const p = (...s: Uint8Array[]) => toB58(findProgramAddress(s, pid)[0]);
  return {
    config: () => p(text('config')),
    round: (seq: bigint | number) => p(text('round'), u64le(seq)),
    plant: (seq: bigint | number, idx: number) => p(text('plant'), u64le(seq), Uint8Array.of(idx)),
    docket: (seq: bigint | number, agent: number) => p(text('docket'), u64le(seq), u16le(agent)),
    agent: (id: number) => p(text('agent'), u16le(id)),
  };
}

export class RpcChain implements IaChain {
  private pda;
  constructor(private rpc: Rpc, public programId: string) { this.pda = pdas(programId); }
  async slot() { return Number(await this.rpc('getSlot', [{ commitment: 'confirmed' }])); }
  private async account(address: string, name: string) {
    const r = await this.rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
    if (!r?.value) return null;
    if (r.value.owner !== this.programId) throw new IaError('BAD_ACCOUNT', `${address} is not owned by the ia program`, 502);
    return decodeAccount(name, new Uint8Array(Buffer.from(r.value.data[0], 'base64')));
  }
  config() { return this.account(this.pda.config(), 'Config'); }
  round(seq: bigint) { return this.account(this.pda.round(seq), 'Round'); }
  async plants(seq: bigint, count: number) {
    if (!count) return [];
    const addrs = Array.from({ length: count }, (_, j) => this.pda.plant(seq, j));
    const r = await this.rpc('getMultipleAccounts', [addrs, { encoding: 'base64', commitment: 'confirmed' }]);
    return r.value.map((v: any) => v && v.owner === this.programId ? decodeAccount('Plant', new Uint8Array(Buffer.from(v.data[0], 'base64'))) : null);
  }
  async events(address: string): Promise<IaEvent[]> {
    const sigs: any[] = [];
    let before: string | undefined;
    for (let page = 0; page < 20; page++) {
      const got: any[] = await this.rpc('getSignaturesForAddress', [address, { limit: 1000, before, commitment: 'confirmed' }]);
      sigs.push(...got);
      if (got.length < 1000) break;
      before = got[got.length - 1].signature;
    }
    const ok = sigs.filter(s => !s.err).reverse();
    const out: IaEvent[] = [];
    for (let k = 0; k < ok.length; k += 8) {
      const txs = await Promise.all(ok.slice(k, k + 8).map(s => this.rpc('getTransaction', [s.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }])));
      txs.forEach((t, j) => {
        if (!t || t.meta?.err) return;
        for (const e of eventsFromLogs(t.meta.logMessages, this.programId)) out.push({ ...e, signature: ok[k + j].signature, slot: t.slot, blockTime: t.blockTime ?? null });
      });
    }
    // same-slot order follows the signature list (newest first from the RPC, reversed): stable within one address
    return out;
  }
}
