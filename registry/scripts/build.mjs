/* Deterministic build of the IA verifier bundle (the POF technique).
   node scripts/build.mjs          builds dist/ia-verifier.mjs and writes dist/BUILD.json (the published bundle hash)
   node scripts/build.mjs --check  builds twice into a temp dir and checks both match dist/BUILD.json
   node scripts/build.mjs --verify builds dist/ia-verifier.mjs and fails unless it matches dist/BUILD.json (the Vercel build)
   Reproduce: same Node major, `npm ci` in ia/registry (the lockfile pins @noble/* and esbuild), then `npm run build:check`.
   No timestamps, no absolute paths, no source maps. Inputs: ia/registry (sources, idl/ia.json), ia/log/src, ia/replay/src and
   the locked node_modules only; @vercel/blob stays external (loaded at run time in production, never in tests). */
import { build, version as esbuildVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ia = path.dirname(here);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const ALLOWED = ['registry/', 'log/src/', 'replay/src/'];

let lastInputs = [];
async function once(outfile) {
  await build({
    absWorkingDir: ia,
    entryPoints: ['registry/src/index.ts'],
    outfile,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', minify: false, sourcemap: false, legalComments: 'none',
    logLevel: 'error', charset: 'utf8', metafile: true,
    nodePaths: [path.join(here, 'node_modules')],
    external: ['@vercel/blob'],
  }).then(r => { lastInputs = Object.keys(r.metafile.inputs); });
  // every input must be one of the verifier's own folders: another part's commit must not change the bundle silently
  const outside = lastInputs.filter(f => path.isAbsolute(f) || f.startsWith('..') || !ALLOWED.some(a => f.startsWith(a)));
  if (outside.length) { console.error('bundle inputs outside the verifier folders: ' + outside.join(', ')); process.exit(1); }
  return fs.readFileSync(outfile);
}

if (process.argv.includes('--check')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iav-'));
  const a = await once(path.join(tmp, 'a.mjs')), b = await once(path.join(tmp, 'b.mjs'));
  const want = JSON.parse(fs.readFileSync(path.join(here, 'dist/BUILD.json'), 'utf8')).sha256;
  fs.rmSync(tmp, { recursive: true, force: true });
  const ok = sha(a) === sha(b) && sha(a) === want;
  console.log(JSON.stringify({ rebuilt: sha(a), again: sha(b), published: want, reproducible: ok }));
  process.exit(ok ? 0 : 1);
}
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const out = await once(path.join(here, 'dist/ia-verifier.mjs'));
if (process.argv.includes('--verify')) {
  const want = JSON.parse(fs.readFileSync(path.join(here, 'dist/BUILD.json'), 'utf8')).sha256;
  const got = sha(out);
  console.log(JSON.stringify({ built: got, published: want, match: got === want }));
  if (got !== want) { console.error('the bundle differs from the published hash in registry/dist/BUILD.json: refusing to deploy'); process.exit(1); }
  process.exit(0);
}
const lock = fs.readFileSync(path.join(here, 'package-lock.json'));
const own = lastInputs.filter(f => !f.includes('node_modules/')).sort();
const sources = Object.fromEntries(own.map(f => [f, sha(fs.readFileSync(path.join(ia, f)))]));
const info = { bundle: 'registry/dist/ia-verifier.mjs', sha256: sha(out), bytes: out.length, esbuild: esbuildVersion, node: process.version.split('.')[0], lockfileSha256: sha(lock), sources };
fs.writeFileSync(path.join(here, 'dist/BUILD.json'), JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify({ sha256: info.sha256, bytes: info.bytes }));
