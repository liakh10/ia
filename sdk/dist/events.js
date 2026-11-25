/**
 * CONTRACT §5: the program's events. Anchor writes each as `Program data: <base64(discriminator ‖ borsh)>` in the transaction log;
 * only lines written while `ia` itself is the running program count (an inner program cannot fake one), and a failed transaction's
 * lines never count.
 */
import { Reader } from "./borsh.js";
import { fromBase64, toHex } from "./bytes.js";
import { IA_IDL } from "./idl/ia.js";
import { IA_PROGRAM_ID } from "./constants.js";
import { camel, modelString } from "./accounts.js";
const byDisc = new Map();
for (const e of IA_IDL.events ?? [])
    byDisc.set(toHex(Uint8Array.from(e.discriminator)), e);
/**
 * Shape by the IDL type: fixed byte arrays (seeds, hashes, trails, roots) as hex, `model` as the version string, a Vec<u8> of small
 * numbers (tiers) as a number array; everything else as decoded.
 */
function shape(fields, d) {
    const out = {};
    for (const f of fields) {
        const k = f.name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
        const v = d[k];
        const t = f.type;
        if (k === "model" && v instanceof Uint8Array)
            out[k] = modelString(v);
        else if (t?.array?.[0] === "u8" && v instanceof Uint8Array)
            out[k] = toHex(v);
        else if ((t?.vec === "u8" || t === "bytes") && v instanceof Uint8Array)
            out[k] = Array.from(v);
        else if (t?.vec?.array?.[0] === "u8" && Array.isArray(v))
            out[k] = v.map((x) => toHex(x));
        else
            out[k] = v;
    }
    return out;
}
/** Decode one `Program data:` payload, or null when it is not an `ia` event. */
export function decodeEvent(b64) {
    let bytes;
    try {
        bytes = fromBase64(b64);
    }
    catch {
        return null;
    }
    if (bytes.length < 8)
        return null;
    const ev = byDisc.get(toHex(bytes.subarray(0, 8)));
    if (!ev)
        return null;
    const t = IA_IDL.types?.find((x) => x.name === ev.name);
    if (!t || t.type.kind !== "struct")
        return null;
    const fields = t.type.fields ?? [];
    const data = camel(new Reader(bytes, 8).struct(IA_IDL, fields));
    return { name: ev.name, data: shape(fields, data) };
}
/**
 * The `ia` events in one transaction's log lines, in order. Tracks the invoke stack: a `Program data:` line counts only while the top
 * of the stack is `programId`.
 */
export function parseEvents(logs, programId = IA_PROGRAM_ID) {
    const stack = [];
    const out = [];
    for (const line of logs) {
        let m = /^Program (\w+) invoke \[\d+\]$/.exec(line);
        if (m) {
            stack.push(m[1]);
            continue;
        }
        m = /^Program (\w+) (success|failed)/.exec(line);
        if (m) {
            if (stack[stack.length - 1] === m[1])
                stack.pop();
            continue;
        }
        if (line.startsWith("Program data: ") && stack[stack.length - 1] === programId) {
            const e = decodeEvent(line.slice("Program data: ".length).trim());
            if (e)
                out.push({ ...e, n: out.length });
        }
    }
    return out;
}
