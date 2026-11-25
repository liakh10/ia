/**
 * CONTRACT §8: the IA log's leaf data (owner: verifier, `log/src/leaves.ts`), decoded for readers. Every leaf is
 * `0x01 version ‖ kind u8 ‖ body`, integers little-endian; bytes come back as hex, u64 as bigint.
 */
import { toHex } from "./bytes.js";
import { encodeBase58 } from "./base58.js";
export const LEAF_KINDS = { 1: "manifest", 2: "transcript", 3: "harness", 4: "verdict", 5: "reveal", 6: "forecast", 7: "redaction" };
export function decodeLeaf(b) {
    let o = 0;
    const take = (n) => {
        if (o + n > b.length)
            throw new Error("log leaf too short");
        const s = b.subarray(o, o + n);
        o += n;
        return s;
    };
    const dv = () => new DataView(b.buffer, b.byteOffset, b.byteLength);
    const r8 = () => take(1)[0];
    const r16 = () => { const v = dv().getUint16(o, true); take(2); return v; };
    const r32 = () => { const v = dv().getUint32(o, true); take(4); return v; };
    const r64 = () => { const v = dv().getBigUint64(o, true); take(8); return v; };
    const hx = (n) => toHex(take(n));
    if (r8() !== 1)
        throw new Error("unknown log leaf version");
    const k = r8();
    let l;
    switch (k) {
        case 1: {
            const seq = r64(), plantClose = r64(), n = r8();
            const plants = Array.from({ length: n }, () => ({ idx: r8(), delivered: r8() === 1, textHash: hx(32) }));
            l = { kind: "manifest", seq, plantClose, plants, bundle: hx(32) };
            break;
        }
        case 2: {
            const seq = r64(), agent = r16(), docketRoot = hx(32), n = r8();
            l = { kind: "transcript", seq, agent, docketRoot, runs: Array.from({ length: n }, () => ({ root: hx(32), entries: r32(), fileHash: hx(32) })) };
            break;
        }
        case 3: {
            const seq = r64(), harness = hx(32), n = r32();
            l = { kind: "harness", seq, harness, manifest: new TextDecoder().decode(take(n)) };
            break;
        }
        case 4: {
            const seq = r64(), agent = r16(), epoch = r32(), slot = r64(), tx = encodeBase58(take(64)), purseAtOpen = r64(), bountyTotal = r64(), transcriptRoot = hx(32), n = r8();
            l = { kind: "verdict", seq, agent, epoch, slot, tx, purseAtOpen, bountyTotal, transcriptRoot, runs: Array.from({ length: n }, () => ({ tier: r8(), taken: r16(), trail: hx(32) })) };
            break;
        }
        case 5:
            l = { kind: "reveal", seq: r64(), idx: r8(), class: r8(), medium: r8(), target: r64(), textHash: hx(32), canary: encodeBase58(take(32)), canarySeed: hx(32), textLen: r16() };
            break;
        case 6:
            l = { kind: "forecast", seq: r64(), agent: r16(), call: r8(), signer: encodeBase58(take(32)), signature: encodeBase58(take(64)), slot: r64() };
            break;
        case 7: {
            const target = r8(), keyHash = hx(32), contentHash = hx(32), n = r8();
            l = { kind: "redaction", target, keyHash, contentHash, reason: new TextDecoder().decode(take(n)) };
            break;
        }
        default:
            throw new Error(`unknown log leaf kind ${k}`);
    }
    if (o !== b.length)
        throw new Error("trailing bytes in log leaf");
    return l;
}
