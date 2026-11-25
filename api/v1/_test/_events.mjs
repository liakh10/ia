// Test helper: an event as Anchor writes it in the log (base64 of discriminator ‖ borsh), from the indexer's camelCase shape.
import * as sdk from "../../../sdk/dist/index.js";

const snake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const bytes = (h) => sdk.fromHex(h);

export function encodeEvent(idl, name, data) {
  const ev = idl.events.find((e) => e.name === name);
  const t = idl.types.find((x) => x.name === name);
  const v = {};
  for (const f of t.type.fields) {
    const camel = f.name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    let x = data[camel];
    if (f.name === "model") { const b = new Uint8Array(64); b.set(new TextEncoder().encode(x)); x = b; }
    else if (f.type?.array?.[0] === "u8" && typeof x === "string") x = bytes(x);
    else if (f.type?.vec?.array?.[0] === "u8") x = x.map(bytes);
    else if (f.type?.defined && x && typeof x === "object" && x.kind) x = Object.fromEntries(Object.entries(x).map(([k, y]) => [k === "kind" ? k : snake(k), y]));
    else if (f.type?.defined && x && typeof x === "object") x = Object.fromEntries(Object.entries(x).map(([k, y]) => [snake(k), y]));
    v[f.name] = x;
  }
  const body = sdk.encodeType(idl, { defined: { name } }, v);
  return Buffer.concat([Buffer.from(ev.discriminator), Buffer.from(body)]).toString("base64");
}
