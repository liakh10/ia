import { type AddressLike } from "./base58.js";
type Hex = string;
export declare function leafHash(leaf: Uint8Array): Promise<Uint8Array>;
export declare function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
/** RFC 9162 §2.1.1 MTH over already-hashed leaves. */
export declare function merkleRoot(leafHashes: Uint8Array[]): Promise<Uint8Array>;
/** RFC 9162 §2.1.3.1 PATH(m, D[n]) over already-hashed leaves. */
export declare function inclusionPath(index: number, leafHashes: Uint8Array[]): Promise<Uint8Array[]>;
/** RFC 9162 §2.1.4.1 PROOF(m, D[n]) over already-hashed leaves: the consistency proof from size m to size n. */
export declare function consistencyProof(m: number, leafHashes: Uint8Array[]): Promise<Uint8Array[]>;
/** RFC 9162 §2.1.3.2: verify an audit path. */
export declare function verifyInclusion(args: {
    leafHash: Uint8Array | Hex;
    index: number;
    treeSize: number;
    path: (Uint8Array | Hex)[];
    rootHash: Uint8Array | Hex;
}): Promise<boolean>;
/** RFC 9162 §2.1.4.2: verify a consistency proof between two tree sizes. */
export declare function verifyConsistency(args: {
    size1: number;
    size2: number;
    root1: Uint8Array | Hex;
    root2: Uint8Array | Hex;
    proof: (Uint8Array | Hex)[];
}): Promise<boolean>;
/**
 * RFC 8785 (JCS): object keys sorted by UTF-16 code units, no whitespace, ECMAScript number and string serialization. Transcript
 * entries hold strings, integers, booleans, null, arrays and objects; a bigint is refused, as in `runner/lib/canon.mjs`.
 */
export declare function canonicalJson(v: unknown): string;
/** `step` of an act = sha256 of the canonical JSON of the tool_call entry that produced it (hex). */
export declare function stepHash(toolCallEntry: unknown): Promise<Hex>;
/** A run's transcript root: the RFC 9162 tree head over its entries (leaf = sha256(0x00 ‖ entry)). */
export declare function transcriptRoot(entries: unknown[]): Promise<Hex>;
/** Parse a published transcript file (JSON Lines) into its raw lines and parsed entries. */
export declare function parseTranscript(jsonl: string): {
    lines: string[];
    entries: any[];
};
/**
 * The docket's root posted by `post_transcript`: the RFC 9162 tree head over its runs' roots in run order, each run root a leaf
 * (leaf = sha256(0x00 ‖ run_root)).
 */
export declare function docketRoot(runRoots: (Hex | Uint8Array)[]): Promise<Hex>;
/** The 80 bytes the log key signs (log/src/keys.ts): "IA-STH-1" ‖ program_id ‖ tree_size u64 LE ‖ root_hash. */
export declare function treeHeadMessage(programId: AddressLike, treeSize: number, rootHash: Uint8Array | Hex, domain?: string): Uint8Array;
export interface SignedTreeHead {
    treeSize: number;
    rootHash: Hex;
    signature: Hex;
    /** the log key, base58 */
    logKey: string;
    programId?: string;
    slot?: number;
    timestamp?: number;
}
export declare function verifyTreeHead(sth: SignedTreeHead, programId: AddressLike, domain?: string): Promise<boolean>;
/** The 88 bytes a witness signs over a head: "IA-WIT-1" ‖ program_id ‖ tree_size ‖ root_hash ‖ timestamp u64 LE (unix s). */
export declare function cosignMessage(programId: AddressLike, treeSize: number, rootHash: Uint8Array | Hex, timestamp: number): Uint8Array;
/**
 * Check one log entry: the audit path leads from the leaf to the head's root, and (when given) the head is signed by a key the reader
 * trusts. `logKeys` must come from somewhere other than the log itself (the repo, the site's /docs, the chain once anchored).
 */
export declare function verifyLogEntry(args: {
    leaf: Uint8Array | Hex;
    index: number;
    proof: {
        treeSize: number;
        rootHash: Hex;
        path: Hex[];
    };
    head?: SignedTreeHead;
    programId: AddressLike;
    logKeys?: string[];
    domain?: string;
}): Promise<{
    ok: boolean;
    checks: {
        included: boolean;
        headMatches: boolean | null;
        headSigned: boolean | null;
        keyTrusted: boolean | null;
    };
}>;
export {};
