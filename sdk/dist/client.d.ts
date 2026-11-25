/** A read client for the `ia` program: config, agents (purses), rounds, plants, dockets, sureties, the next plant price. */
import { type RpcLike } from "./rpc.js";
import { type AddressLike } from "./base58.js";
import { type AgentAccount } from "./accounts.js";
export interface IaClientOptions {
    rpc: RpcLike | string;
    /** another deployment of the program (a local validator, a fork); refused unless `allowOtherDeployment` */
    programId?: string;
    allowOtherDeployment?: boolean;
}
export declare class IaClient {
    rpc: RpcLike;
    programId: string;
    private p;
    constructor(o: IaClientOptions);
    get pdas(): {
        config: () => Promise<string>;
        treasury: () => Promise<string>;
        runnerFund: () => Promise<string>;
        agent: (id: number) => Promise<string>;
        surety: (agent: number, owner: AddressLike) => Promise<string>;
        round: (seq: bigint | number) => Promise<string>;
        plant: (seq: bigint | number, idx: number) => Promise<string>;
        docket: (seq: bigint | number, agent: number) => Promise<string>;
        programData: () => Promise<string>;
    };
    private read;
    getConfig(): Promise<any>;
    getTreasury(): Promise<({
        feesIn: bigint;
        feesOut: bigint;
    } & {
        address: string;
        lamports: number;
    }) | null>;
    getRunnerFund(): Promise<({
        fundIn: bigint;
        drawnTotal: bigint;
        drawnRound: bigint;
        drawnThisRound: bigint;
    } & {
        address: string;
        lamports: number;
    }) | null>;
    getAgent(id: number): Promise<(AgentAccount & {
        address: string;
        lamports: number;
    }) | null>;
    /** every agent account, by id */
    listAgents(): Promise<(AgentAccount & {
        address: string;
        lamports: number;
    })[]>;
    getRound(seq: bigint | number): Promise<(import("./accounts.js").RoundAccount & {
        address: string;
        lamports: number;
    }) | null>;
    /** the newest round (next_round − 1), or null before the first */
    getCurrentRound(): Promise<(import("./accounts.js").RoundAccount & {
        address: string;
        lamports: number;
    }) | null>;
    getPlant(seq: bigint | number, idx: number): Promise<any>;
    getDocket(seq: bigint | number, agent: number): Promise<any>;
    getSurety(agent: number, owner: AddressLike): Promise<({
        agent: number;
        owner: string;
        shares: bigint;
        unbondShares: bigint;
        unbondSlot: bigint;
        bump: number;
    } & {
        address: string;
        lamports: number;
    }) | null>;
    /** an owner's positions: shares and what they are worth now (the purse's owned assets pro rata) */
    getPositions(owner: AddressLike): Promise<{
        agent: number;
        model: string;
        shares: bigint;
        unbondShares: bigint;
        unbondSlot: bigint;
        worth: bigint;
    }[]>;
    /**
     * The price of the next plant in a round and its split (CONTRACT §3), or null when the round is closed for plants or full.
     * `holder`: the planter holds ≥ holder_min $IA (no treasury share).
     */
    quotePlant(seq?: bigint | number, holder?: boolean): Promise<{
        round: bigint;
        index: number;
        open: boolean;
        slot: number;
        plantClose: bigint;
        price: bigint;
        split: {
            purses: bigint;
            runner: bigint;
            treasury: bigint;
        };
        lineup: number[];
    } | null>;
}
