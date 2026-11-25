import { type AddressLike } from "./base58.js";
import type { Action } from "./ledger.js";
export interface AccountMeta {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
}
export interface Instruction {
    programId: string;
    keys: AccountMeta[];
    /** base64 */
    data: string;
}
/**
 * Build any `ia` instruction by its IDL name. `accounts` by IDL name (snake_case or camelCase). The fixed accounts are filled in:
 * config, treasury, runner_fund, program_data, slot_hashes, system_program and any account the IDL pins to an address. An optional
 * account left out is passed as the program id (Anchor's "None").
 */
export declare function buildInstruction(name: string, args: Record<string, any>, accounts: Record<string, AddressLike | null | undefined>, opts?: {
    programId?: string;
    remaining?: AccountMeta[];
}): Promise<Instruction>;
export interface PlantArgs {
    round: bigint | number;
    /** the plant's index = the round's plant_count now (read it from the Round account) */
    index: number;
    planter: AddressLike;
    /** 0 TRANSFER, 1 KEY, 2 REPORT */
    class: number;
    /** 0 email, 1 invoice, 2 tool_output, 3 memory, 4 file */
    medium: number;
    /** sha256 of the text after {{PLANT}}/{{CANARY}} replacement (the registry's quote returns it), hex */
    textHash: string;
    target?: bigint | number;
    canary?: AddressLike | null;
    /** pass the $IA mint and its token program to claim the holder exemption (the planter's ATA is derived) */
    holder?: {
        mint: AddressLike;
        tokenProgram: AddressLike;
    } | null;
    programId?: string;
}
export declare function plantInstruction(a: PlantArgs): Promise<Instruction>;
export declare function depositInstruction(a: {
    agent: number;
    owner: AddressLike;
    lamports: bigint | number;
    programId?: string;
}): Promise<Instruction>;
export declare function requestUnbondInstruction(a: {
    agent: number;
    owner: AddressLike;
    shares: bigint;
    programId?: string;
}): Promise<Instruction>;
export declare function withdrawInstruction(a: {
    agent: number;
    owner: AddressLike;
    programId?: string;
}): Promise<Instruction>;
export declare function claimPlantInstruction(a: {
    round: bigint | number;
    index: number;
    planter: AddressLike;
    programId?: string;
}): Promise<Instruction>;
/** `lineup`: every active house agent id, ascending (the Config's active agents). */
export declare function openRoundInstruction(a: {
    seq: bigint | number;
    payer: AddressLike;
    lineup: number[];
    programId?: string;
}): Promise<Instruction>;
export declare function openDocketInstruction(a: {
    seq: bigint | number;
    agent: number;
    payer: AddressLike;
    programId?: string;
}): Promise<Instruction>;
/** `payer`: the docket's payer (it gets the rent back), read from the Docket account. */
export declare function settleDocketInstruction(a: {
    seq: bigint | number;
    agent: number;
    caller: AddressLike;
    payer: AddressLike;
    programId?: string;
}): Promise<Instruction>;
export declare function closeEmptyRoundInstruction(a: {
    seq: bigint | number;
    programId?: string;
}): Promise<Instruction>;
/** A session key's act (the runner's and an Open League operator's tool). `signers`: extra signer keys (a canary). */
export declare function actInstruction(a: {
    seq: bigint | number;
    agent: number;
    run: number;
    session: AddressLike;
    step: string;
    action: Action;
    signers?: AddressLike[];
    programId?: string;
}): Promise<Instruction>;
/**
 * Compile instructions into a legacy message and wrap it in a transaction with empty signature slots (base64), ready for a wallet's
 * signTransaction. The fee payer is the first signer.
 */
export declare function unsignedTransaction(args: {
    feePayer: AddressLike;
    recentBlockhash: string;
    instructions: Instruction[];
}): {
    transaction: string;
    message: string;
    signers: string[];
};
/** Turn an SDK instruction into a web3.js TransactionInstruction (pass the web3 module you use). */
export declare function toWeb3Instruction(ix: Instruction, web3: any): any;
