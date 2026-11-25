/**
 * Instruction builders, driven by the IDL's account lists (so an IDL change that adds or reorders accounts needs no code change here),
 * and an unsigned legacy transaction serializer, so a wallet, a bot or the MCP `quote_plant` tool can hand a user a transaction to sign
 * without @solana/web3.js. Convert to web3.js with `toWeb3Instruction(ix, web3)` if you use it.
 */
import { encodeInstruction } from "./borsh.js";
import { concat, fromBase64 } from "./bytes.js";
import { decodeBase58, toAddress, toAddressBytes } from "./base58.js";
import { IA_IDL } from "./idl/ia.js";
import { IA_PROGRAM_ID, SLOT_HASHES_ID, SYSTEM_PROGRAM_ID } from "./constants.js";
import { pdas, associatedTokenAddress } from "./accounts.js";
const snake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const b64 = (b) => {
    const B = globalThis.Buffer;
    if (B)
        return B.from(b).toString("base64");
    let s = "";
    for (const x of b)
        s += String.fromCharCode(x);
    return btoa(s);
};
/**
 * Build any `ia` instruction by its IDL name. `accounts` by IDL name (snake_case or camelCase). The fixed accounts are filled in:
 * config, treasury, runner_fund, program_data, slot_hashes, system_program and any account the IDL pins to an address. An optional
 * account left out is passed as the program id (Anchor's "None").
 */
export async function buildInstruction(name, args, accounts, opts = {}) {
    const programId = opts.programId ?? IA_PROGRAM_ID;
    const ix = IA_IDL.instructions.find((x) => x.name === name || x.name === snake(name));
    if (!ix)
        throw new Error(`no instruction ${name} in the IDL`);
    const p = pdas(programId);
    const given = {};
    for (const [k, v] of Object.entries(accounts))
        given[snake(k)] = v;
    const fixed = {
        config: p.config, treasury: p.treasury, runner_fund: p.runnerFund, program_data: p.programData,
        slot_hashes: () => SLOT_HASHES_ID, system_program: () => SYSTEM_PROGRAM_ID,
    };
    const keys = [];
    for (const a of ix.accounts) {
        let key = null;
        const v = given[a.name];
        if (v)
            key = toAddress(v);
        else if (a.address)
            key = a.address;
        else if (fixed[a.name] && v !== null)
            key = await fixed[a.name]();
        if (!key) {
            if (a.optional) {
                keys.push({ pubkey: programId, isSigner: false, isWritable: false });
                continue;
            }
            throw new Error(`${ix.name}: account ${a.name} is required`);
        }
        keys.push({ pubkey: key, isSigner: !!a.signer, isWritable: !!a.writable });
    }
    const snakeArgs = {};
    for (const [k, v] of Object.entries(args))
        snakeArgs[snake(k)] = v;
    return { programId, keys: [...keys, ...(opts.remaining ?? [])], data: b64(encodeInstruction(IA_IDL, ix.name, snakeArgs)) };
}
export async function plantInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    if (a.maxPrice === undefined || a.maxPrice === null)
        throw new Error("plantInstruction: maxPrice is required (the quoted price)");
    return buildInstruction("plant", {
        class: a.class, medium: a.medium, textHash: hex32(a.textHash), target: BigInt(a.target ?? 0), canary: a.canary ? toAddress(a.canary) : SYSTEM_PROGRAM_ID,
        maxPrice: BigInt(a.maxPrice),
    }, {
        planter: a.planter, round: await p.round(a.round), plant: await p.plant(a.round, a.index),
        holderToken: a.holder ? await associatedTokenAddress(a.planter, a.holder.mint, a.holder.tokenProgram) : undefined,
    }, { programId: a.programId });
}
export async function depositInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    return buildInstruction("deposit", { lamports: BigInt(a.lamports) }, { owner: a.owner, agent: await p.agent(a.agent), surety: await p.surety(a.agent, a.owner) }, a);
}
export async function requestUnbondInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    return buildInstruction("request_unbond", { shares: a.shares }, { owner: a.owner, agent: await p.agent(a.agent), surety: await p.surety(a.agent, a.owner) }, a);
}
export async function withdrawInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    return buildInstruction("withdraw", {}, { owner: a.owner, agent: await p.agent(a.agent), surety: await p.surety(a.agent, a.owner) }, a);
}
export async function claimPlantInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    return buildInstruction("claim_plant", {}, { planter: a.planter, round: await p.round(a.round), plant: await p.plant(a.round, a.index) }, a);
}
/** `lineup`: every active house agent id, ascending (the Config's active agents). */
export async function openRoundInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    const seq = BigInt(a.seq);
    // writable: open_round marks each lineup agent busy until its docket settles
    const remaining = await Promise.all(a.lineup.map(async (id) => ({ pubkey: await p.agent(id), isSigner: false, isWritable: true })));
    return buildInstruction("open_round", {}, {
        payer: a.payer, prevRound: seq > 0n ? await p.round(seq - 1n) : undefined, round: await p.round(seq),
    }, { programId: a.programId, remaining });
}
export async function openDocketInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    return buildInstruction("open_docket", {}, { payer: a.payer, round: await p.round(a.seq), agent: await p.agent(a.agent), docket: await p.docket(a.seq, a.agent) }, a);
}
/** `payer`: the docket's payer (it gets the rent back), read from the Docket account. */
export async function settleDocketInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    return buildInstruction("settle_docket", {}, { caller: a.caller, round: await p.round(a.seq), agent: await p.agent(a.agent), docket: await p.docket(a.seq, a.agent), payer: a.payer }, a);
}
/** `lineup`: the round's lineup ids in order (Round.lineup): they are released from test, so they are passed writable. */
export async function closeEmptyRoundInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    const remaining = await Promise.all(a.lineup.map(async (id) => ({ pubkey: await p.agent(id), isSigner: false, isWritable: true })));
    return buildInstruction("close_empty_round", {}, { round: await p.round(a.seq) }, { programId: a.programId, remaining });
}
/** A session key's act (the runner's and an Open League operator's tool). `signers`: extra signer keys (a canary). */
export async function actInstruction(a) {
    const p = pdas(a.programId ?? IA_PROGRAM_ID);
    const action = a.action.kind === "Pay" ? { kind: "Pay", source: a.action.source, to: a.action.to, amount: a.action.amount }
        : a.action.kind === "Flag" ? { kind: "Flag", target: a.action.target }
            : { kind: "Report", operating: a.action.operating, reserve: a.action.reserve, payments: a.action.payments, total: a.action.total };
    return buildInstruction("act", { run: a.run, step: hex32(a.step), action }, { session: a.session, round: await p.round(a.seq), docket: await p.docket(a.seq, a.agent) }, {
        programId: a.programId, remaining: (a.signers ?? []).map((k) => ({ pubkey: toAddress(k), isSigner: true, isWritable: false })),
    });
}
function hex32(h) {
    const s = h.startsWith("0x") ? h.slice(2) : h;
    if (!/^[0-9a-fA-F]{64}$/.test(s))
        throw new Error("expected 32 bytes as 64 hex characters");
    return Uint8Array.from(s.match(/../g).map((x) => parseInt(x, 16)));
}
/* ---------- unsigned legacy transactions ---------- */
function shortVec(n) {
    const out = [];
    for (;;) {
        let b = n & 0x7f;
        n >>= 7;
        if (n)
            b |= 0x80;
        out.push(b);
        if (!n)
            return Uint8Array.from(out);
    }
}
/**
 * Compile instructions into a legacy message and wrap it in a transaction with empty signature slots (base64), ready for a wallet's
 * signTransaction. The fee payer is the first signer.
 */
export function unsignedTransaction(args) {
    const payer = toAddress(args.feePayer);
    const metas = new Map();
    const add = (k, s, w) => {
        const m = metas.get(k) ?? { s: false, w: false };
        metas.set(k, { s: m.s || s, w: m.w || w });
    };
    add(payer, true, true);
    for (const ix of args.instructions) {
        for (const k of ix.keys)
            add(k.pubkey, k.isSigner, k.isWritable);
        add(ix.programId, false, false);
    }
    const all = [...metas.entries()];
    const group = (s, w) => all.filter(([k, m]) => k !== payer && m.s === s && m.w === w).map(([k]) => k);
    const order = [payer, ...group(true, true), ...group(true, false), ...group(false, true), ...group(false, false)];
    const idx = new Map(order.map((k, i) => [k, i]));
    const signers = order.filter((k) => metas.get(k).s);
    const roSigned = signers.filter((k) => !metas.get(k).w).length;
    const roUnsigned = order.filter((k) => !metas.get(k).s && !metas.get(k).w).length;
    const ixBytes = args.instructions.map((ix) => {
        const data = fromBase64(ix.data);
        return concat(Uint8Array.of(idx.get(ix.programId)), shortVec(ix.keys.length), Uint8Array.from(ix.keys.map((k) => idx.get(k.pubkey))), shortVec(data.length), data);
    });
    const message = concat(Uint8Array.of(signers.length, roSigned, roUnsigned), shortVec(order.length), ...order.map((k) => toAddressBytes(k)), decodeBase58(args.recentBlockhash), shortVec(ixBytes.length), ...ixBytes);
    const tx = concat(shortVec(signers.length), new Uint8Array(64 * signers.length), message);
    return { transaction: b64(tx), message: b64(message), signers };
}
/** Turn an SDK instruction into a web3.js TransactionInstruction (pass the web3 module you use). */
export function toWeb3Instruction(ix, web3) {
    const B = globalThis.Buffer;
    return new web3.TransactionInstruction({
        programId: new web3.PublicKey(ix.programId),
        keys: ix.keys.map((k) => ({ pubkey: new web3.PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
        data: B.from(ix.data, "base64"),
    });
}
