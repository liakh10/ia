export type Commitment = "processed" | "confirmed" | "finalized";
export interface AccountData {
    address: string;
    owner: string;
    lamports: number;
    data: Uint8Array;
}
export type MemcmpFilter = {
    memcmp: {
        offset: number;
        bytes: string;
    };
} | {
    dataSize: number;
};
export interface RpcLike {
    getSlot(commitment?: Commitment): Promise<number>;
    getAccount(address: string): Promise<AccountData | null>;
    getAccounts(addresses: string[]): Promise<(AccountData | null)[]>;
    getProgramAccounts(programId: string, filters: MemcmpFilter[]): Promise<AccountData[]>;
    /** optional: accounts plus the slot they were read at, in ONE call (saves the separate getSlot) */
    getAccountsWithSlot?(addresses: string[]): Promise<{
        slot: number;
        accounts: (AccountData | null)[];
    }>;
    getProgramAccountsWithSlot?(programId: string, filters: MemcmpFilter[]): Promise<{
        slot: number;
        accounts: AccountData[];
    }>;
    /** optional: transaction history of an address, newest first */
    getSignaturesForAddress?(address: string, opts?: {
        before?: string;
        limit?: number;
    }): Promise<{
        signature: string;
        slot: number;
        err: unknown;
    }[]>;
    /** optional: the log lines of one transaction */
    getTransactionLogs?(signature: string): Promise<string[] | null>;
    /** optional: one transaction's slot, block time, error and log lines (the indexer's input) */
    getTransaction?(signature: string): Promise<TxLogs | null>;
    /** optional: a recent blockhash (to build a transaction) */
    getLatestBlockhash?(): Promise<{
        blockhash: string;
        lastValidBlockHeight: number;
    }>;
}
export interface TxLogs {
    signature: string;
    slot: number;
    blockTime: number | null;
    err: unknown;
    logs: string[];
}
export declare class RpcError extends Error {
    code?: number | undefined;
    constructor(message: string, code?: number | undefined);
}
export declare class Rpc implements RpcLike {
    url: string;
    private opts;
    private id;
    constructor(url: string, opts?: {
        commitment?: Commitment;
        fetch?: typeof fetch;
        headers?: Record<string, string>;
        timeoutMs?: number;
    });
    get commitment(): Commitment;
    call<T = any>(method: string, params: unknown[]): Promise<T>;
    getSlot(commitment?: Commitment): Promise<number>;
    private toAccount;
    getAccount(address: string): Promise<AccountData | null>;
    getAccounts(addresses: string[]): Promise<(AccountData | null)[]>;
    getSignaturesForAddress(address: string, opts?: {
        before?: string;
        limit?: number;
    }): Promise<{
        signature: string;
        slot: number;
        err: unknown;
    }[]>;
    getTransactionLogs(signature: string): Promise<string[] | null>;
    getTransaction(signature: string): Promise<TxLogs | null>;
    getLatestBlockhash(): Promise<{
        blockhash: string;
        lastValidBlockHeight: number;
    }>;
    getAccountsWithSlot(addresses: string[]): Promise<{
        slot: number;
        accounts: (AccountData | null)[];
    }>;
    getProgramAccountsWithSlot(programId: string, filters: MemcmpFilter[]): Promise<{
        slot: number;
        accounts: AccountData[];
    }>;
    getProgramAccounts(programId: string, filters: MemcmpFilter[]): Promise<AccountData[]>;
}
export declare function memcmp(offset: number, bytes: Uint8Array): MemcmpFilter;
