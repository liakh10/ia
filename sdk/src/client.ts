/** A read client for the `ia` program: config, agents (purses), rounds, plants, dockets, sureties, the next plant price. */
import { Rpc, memcmp, type RpcLike } from "./rpc.js";
import { toAddress, type AddressLike } from "./base58.js";
import { IA_PROGRAM_ID } from "./constants.js";
import {
  pdas, decodeConfig, decodeAgent, decodeRound, decodePlant, decodeDocket, decodeSurety, decodeTreasury, decodeRunnerFund, discriminator,
  type AgentAccount,
} from "./accounts.js";
import { plantPrice, split, lamportsFor } from "./rules.js";

export interface IaClientOptions {
  rpc: RpcLike | string;
  /** another deployment of the program (a local validator, a fork); refused unless `allowOtherDeployment` */
  programId?: string;
  allowOtherDeployment?: boolean;
}

export class IaClient {
  rpc: RpcLike;
  programId: string;
  private p: ReturnType<typeof pdas>;
  constructor(o: IaClientOptions) {
    this.rpc = typeof o.rpc === "string" ? new Rpc(o.rpc) : o.rpc;
    const id = o.programId ? toAddress(o.programId) : IA_PROGRAM_ID;
    if (id !== IA_PROGRAM_ID && !o.allowOtherDeployment) {
      throw new Error(`programId ${id} is not Internal Affairs (${IA_PROGRAM_ID}); pass allowOtherDeployment: true to read another deployment on purpose`);
    }
    this.programId = id;
    this.p = pdas(id);
  }
  get pdas() {
    return this.p;
  }

  private async read<T>(address: string, decode: (d: Uint8Array) => T): Promise<(T & { address: string; lamports: number }) | null> {
    const a = await this.rpc.getAccount(address);
    if (!a || a.owner !== this.programId) return null;
    return { ...decode(a.data), address, lamports: a.lamports };
  }

  async getConfig() {
    return this.read(await this.p.config(), decodeConfig);
  }
  async getTreasury() {
    return this.read(await this.p.treasury(), decodeTreasury);
  }
  async getRunnerFund() {
    return this.read(await this.p.runnerFund(), decodeRunnerFund);
  }
  async getAgent(id: number) {
    return this.read(await this.p.agent(id), decodeAgent);
  }
  /** every agent account, by id */
  async listAgents(): Promise<(AgentAccount & { address: string; lamports: number })[]> {
    const list = await this.rpc.getProgramAccounts(this.programId, [memcmp(0, discriminator("Agent"))]);
    return list.map((a) => ({ ...decodeAgent(a.data), address: a.address, lamports: a.lamports })).sort((a, b) => a.id - b.id);
  }
  async getRound(seq: bigint | number) {
    return this.read(await this.p.round(seq), decodeRound);
  }
  /** the newest round (next_round − 1), or null before the first */
  async getCurrentRound() {
    const c = await this.getConfig();
    if (!c || c.nextRound === 0n) return null;
    return this.getRound(c.nextRound - 1n);
  }
  async getPlant(seq: bigint | number, idx: number) {
    return this.read(await this.p.plant(seq, idx), decodePlant);
  }
  async getDocket(seq: bigint | number, agent: number) {
    return this.read(await this.p.docket(seq, agent), decodeDocket);
  }
  async getSurety(agent: number, owner: AddressLike) {
    return this.read(await this.p.surety(agent, owner), decodeSurety);
  }
  /** an owner's positions: shares and what they are worth now (the purse's owned assets pro rata) */
  async getPositions(owner: AddressLike) {
    const agents = await this.listAgents();
    const out = [];
    for (const a of agents) {
      const s = await this.getSurety(a.id, owner);
      if (!s || (s.shares === 0n && s.unbondShares === 0n)) continue;
      out.push({ agent: a.id, model: a.model, shares: s.shares, unbondShares: s.unbondShares, unbondSlot: s.unbondSlot, worth: lamportsFor(s.shares, a.shares, a.assets - a.orphan) });
    }
    return out;
  }
  /**
   * The price of the next plant in a round and its split (CONTRACT §3), or null when the round is closed for plants or full.
   * `holder`: the planter holds ≥ holder_min $IA (no treasury share).
   */
  async quotePlant(seq?: bigint | number, holder = false) {
    const [c, slot] = await Promise.all([this.getConfig(), this.rpc.getSlot()]);
    if (!c) return null;
    const r = seq === undefined ? await this.getCurrentRound() : await this.getRound(seq);
    if (!r) return null;
    const P = (r as any).params ?? c.params; // the Round snapshots its Params once the program does (BOARD 11-25)
    const open = BigInt(slot) < r.plantClose && r.plantCount < P.maxPlants && r.state === 0;
    const price = plantPrice(P.minPlant, r.lineupAssets, P.priceBps, P.stepBps, r.plantCount);
    return { round: r.seq, index: r.plantCount, open, slot, plantClose: r.plantClose, price, split: split(price, P.runnerBps, P.treasuryBps, holder), lineup: r.lineup };
  }
}
