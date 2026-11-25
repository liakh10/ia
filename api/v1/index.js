// Vercel function for /v1/* (vercel.json rewrites /v1/:path* to /api/v1?path=:path*).
import { handleV1 } from "./_core.js";

const MAX_BODY = 4 * 1024;

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > MAX_BODY) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const query = Object.fromEntries(url.searchParams);
  const path = query.path ?? url.pathname.replace(/^\/(api\/)?v1\/?/, "");
  delete query.path;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const ip = String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const body = req.method === "POST" ? await readBody(req) : undefined;
  if (req.method === "POST" && body === null) {
    res.statusCode = 413;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: { code: "too_large", message: "a forecast is a few hundred bytes" } }));
  }
  const out = await handleV1({ method: req.method, path, query, body, ip, origin: `${proto}://${req.headers.host}` });
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.end(req.method === "HEAD" ? "" : out.body);
}
