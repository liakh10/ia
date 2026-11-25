/**
 * CONTRACT §6 and §8: RFC 9162 Merkle hashing (from @pof/sdk), inclusion and consistency proofs, the transcript root of a run and of a
 * docket, the `step` hash of a tool call, RFC 8785 canonical JSON, and signed tree heads of the IA log.
 */
import { concat, ed25519Verify, equalBytes, fromHex, sha256, toHex, utf8, u64le } from "./bytes.js";
import { toAddressBytes } from "./base58.js";
const h = (x) => (typeof x === "string" ? fromHex(x) : x);
export function leafHash(leaf) {
    return sha256(Uint8Array.of(0), leaf);
}
export function nodeHash(left, right) {
    return sha256(Uint8Array.of(1), left, right);
}
function largestPow2Below(n) {
    let k = 1;
    while (k * 2 < n)
        k *= 2;
    return k;
}
/** RFC 9162 §2.1.1 MTH over already-hashed leaves. */
export async function merkleRoot(leafHashes) {
    if (leafHashes.length === 0)
        return sha256(new Uint8Array(0));
    if (leafHashes.length === 1)
        return leafHashes[0];
    const k = largestPow2Below(leafHashes.length);
    return nodeHash(await merkleRoot(leafHashes.slice(0, k)), await merkleRoot(leafHashes.slice(k)));
}
/** RFC 9162 §2.1.3.1 PATH(m, D[n]) over already-hashed leaves. */
export async function inclusionPath(index, leafHashes) {
    const n = leafHashes.length;
    if (index < 0 || index >= n)
        throw new Error("index out of range");
    if (n === 1)
        return [];
    const k = largestPow2Below(n);
    if (index < k)
        return [...(await inclusionPath(index, leafHashes.slice(0, k))), await merkleRoot(leafHashes.slice(k))];
    return [...(await inclusionPath(index - k, leafHashes.slice(k))), await merkleRoot(leafHashes.slice(0, k))];
}
/** RFC 9162 §2.1.4.1 PROOF(m, D[n]) over already-hashed leaves: the consistency proof from size m to size n. */
export async function consistencyProof(m, leafHashes) {
    const n = leafHashes.length;
    if (m < 0 || m > n)
        throw new Error("size out of range");
    if (m === 0 || m === n)
        return [];
    return subproof(m, leafHashes, true);
}
async function subproof(m, d, b) {
    const n = d.length;
    if (m === n)
        return b ? [] : [await merkleRoot(d)];
    const k = largestPow2Below(n);
    if (m <= k)
        return [...(await subproof(m, d.slice(0, k), b)), await merkleRoot(d.slice(k))];
    return [...(await subproof(m - k, d.slice(k), false)), await merkleRoot(d.slice(0, k))];
}
/** RFC 9162 §2.1.3.2: verify an audit path. */
export async function verifyInclusion(args) {
    const { index, treeSize } = args;
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(treeSize) || index < 0 || index >= treeSize)
        return false;
    let fn = BigInt(index);
    let sn = BigInt(treeSize - 1);
    let r = h(args.leafHash);
    for (const pRaw of args.path) {
        const p = h(pRaw);
        if (sn === 0n)
            return false;
        if ((fn & 1n) === 1n || fn === sn) {
            r = await nodeHash(p, r);
            if ((fn & 1n) === 0n) {
                while ((fn & 1n) === 0n && fn !== 0n) {
                    fn >>= 1n;
                    sn >>= 1n;
                }
            }
        }
        else {
            r = await nodeHash(r, p);
        }
        fn >>= 1n;
        sn >>= 1n;
    }
    return sn === 0n && equalBytes(r, h(args.rootHash));
}
/** RFC 9162 §2.1.4.2: verify a consistency proof between two tree sizes. */
export async function verifyConsistency(args) {
    const { size1, size2 } = args;
    const root1 = h(args.root1);
    const root2 = h(args.root2);
    const proof = args.proof.map(h);
    if (size1 > size2 || size1 < 0)
        return false;
    if (size1 === size2)
        return proof.length === 0 && equalBytes(root1, root2);
    if (size1 === 0)
        return proof.length === 0;
    if (proof.length === 0)
        return false;
    let path = proof;
    // if size1 is an exact power of two, prepend root1
    if ((size1 & (size1 - 1)) === 0)
        path = [root1, ...proof];
    let fn = BigInt(size1 - 1);
    let sn = BigInt(size2 - 1);
    while ((fn & 1n) === 1n) {
        fn >>= 1n;
        sn >>= 1n;
    }
    let fr = path[0];
    let sr = path[0];
    for (const c of path.slice(1)) {
        if (sn === 0n)
            return false;
        if ((fn & 1n) === 1n || fn === sn) {
            fr = await nodeHash(c, fr);
            sr = await nodeHash(c, sr);
            if ((fn & 1n) === 0n) {
                while ((fn & 1n) === 0n && fn !== 0n) {
                    fn >>= 1n;
                    sn >>= 1n;
                }
            }
        }
        else {
            sr = await nodeHash(sr, c);
        }
        fn >>= 1n;
        sn >>= 1n;
    }
    return sn === 0n && equalBytes(fr, root1) && equalBytes(sr, root2);
}
/* ---------- RFC 8785 canonical JSON (the transcript's encoding) ---------- */
/**
 * RFC 8785 (JCS): object keys sorted by UTF-16 code units, no whitespace, ECMAScript number and string serialization. Transcript
 * entries hold strings, integers, booleans, null, arrays and objects; a bigint is refused, as in `runner/lib/canon.mjs`.
 */
export function canonicalJson(v) {
    if (v === null || v === undefined)
        return "null";
    if (typeof v === "bigint")
        throw new Error("canonical JSON: write a bigint as a decimal string or a safe integer (as the runner does)");
    if (typeof v === "number") {
        if (!Number.isFinite(v))
            throw new Error("canonical JSON has no NaN or Infinity");
        return JSON.stringify(v);
    }
    if (typeof v === "string" || typeof v === "boolean")
        return JSON.stringify(v);
    if (Array.isArray(v))
        return `[${v.map(canonicalJson).join(",")}]`;
    if (typeof v === "object") {
        const o = v;
        const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
    }
    throw new Error(`canonical JSON cannot encode ${typeof v}`);
}
/** An entry's bytes: the canonical JSON of an object, or a JSONL line as published (taken as is). */
const entryBytes = (e) => utf8(typeof e === "string" ? e : canonicalJson(e));
/** `step` of an act = sha256 of the canonical JSON of the tool_call entry that produced it (hex). */
export async function stepHash(toolCallEntry) {
    return toHex(await sha256(entryBytes(toolCallEntry)));
}
/** A run's transcript root: the RFC 9162 tree head over its entries (leaf = sha256(0x00 ‖ entry)). */
export async function transcriptRoot(entries) {
    const leaves = await Promise.all(entries.map((e) => leafHash(entryBytes(e))));
    return toHex(await merkleRoot(leaves));
}
/** Parse a published transcript file (JSON Lines) into its raw lines and parsed entries. */
export function parseTranscript(jsonl) {
    const lines = jsonl.split("\n").filter((l) => l.trim().length);
    return { lines, entries: lines.map((l) => JSON.parse(l)) };
}
/**
 * The docket's root posted by `post_transcript`: the RFC 9162 tree head over its runs' roots in run order, each run root a leaf
 * (leaf = sha256(0x00 ‖ run_root)).
 */
export async function docketRoot(runRoots) {
    return toHex(await merkleRoot(await Promise.all(runRoots.map((r) => leafHash(h(r))))));
}
/* ---------- the IA log's signed tree heads (CONTRACT §8, the POF technique) ---------- */
/** The 80 bytes the log key signs: "IA-STH01" ‖ program_id ‖ tree_size u64 LE ‖ root_hash. */
export function treeHeadMessage(programId, treeSize, rootHash, domain = "IA-STH01") {
    return concat(utf8(domain), toAddressBytes(programId), u64le(treeSize), h(rootHash));
}
export function verifyTreeHead(sth, programId, domain) {
    return ed25519Verify(toAddressBytes(sth.logKey), treeHeadMessage(programId, sth.treeSize, sth.rootHash, domain), fromHex(sth.signature)).catch(() => false);
}
/** The 88 bytes a witness signs over a head: "IA-WIT01" ‖ program_id ‖ tree_size ‖ root_hash ‖ timestamp u64 LE (POF CONTRACT §8). */
export function cosignMessage(programId, treeSize, rootHash, timestamp) {
    return concat(utf8("IA-WIT01"), toAddressBytes(programId), u64le(treeSize), h(rootHash), u64le(timestamp));
}
/**
 * Check one log entry: the audit path leads from the leaf to the head's root, and (when given) the head is signed by a key the reader
 * trusts. `logKeys` must come from somewhere other than the log itself (the repo, the site's /docs, the chain once anchored).
 */
export async function verifyLogEntry(args) {
    const included = await verifyInclusion({
        leafHash: await leafHash(h(args.leaf)), index: args.index, treeSize: args.proof.treeSize, path: args.proof.path, rootHash: args.proof.rootHash,
    });
    let headMatches = null, headSigned = null, keyTrusted = null;
    if (args.head) {
        headMatches = args.head.treeSize === args.proof.treeSize && args.head.rootHash.toLowerCase() === args.proof.rootHash.toLowerCase();
        headSigned = await verifyTreeHead(args.head, args.programId, args.domain);
        keyTrusted = args.logKeys ? args.logKeys.includes(args.head.logKey) : null;
    }
    return { ok: included && headMatches !== false && headSigned !== false && keyTrusted !== false, checks: { included, headMatches, headSigned, keyTrusted } };
}
