// The reproducible bundle and the keys script (never prints a secret, never overwrites, values to Vercel only through stdin).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');

test('the bundle rebuilds byte for byte and matches dist/BUILD.json; its inputs are the verifier\'s own folders', () => {
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--check'], { cwd: pkg, encoding: 'utf8' });
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.reproducible, true, r.stdout + r.stderr);
  const info = JSON.parse(fs.readFileSync(path.join(pkg, 'dist/BUILD.json'), 'utf8'));
  for (const f of Object.keys(info.sources)) assert.ok(/^(registry\/(src|idl)\/|log\/src\/|replay\/src\/)/.test(f), f);
  assert.ok(info.sources['registry/idl/ia.json'], 'the IDL is pinned by the bundle hash');
  const b = fs.readFileSync(path.join(pkg, 'dist/ia-verifier.mjs'), 'utf8');
  assert.ok(!b.includes(process.env.HOME || '/Users/'), 'no absolute paths');
});

test('keys: made once with mode 600 in a 700 folder, public key printed, secrets never; --vercel sends values on stdin', () => {
  const dir = path.join(tmpdir(), 'cfg');
  const env = { ...process.env, IA_CONFIG_DIR: dir };
  const a = spawnSync(process.execPath, ['scripts/keys.mjs'], { cwd: pkg, env, encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'log.json'), 'utf8')), seal = fs.readFileSync(path.join(dir, 'seal.hex'), 'utf8').trim();
  assert.equal(log.length, 64); assert.equal(seal.length, 64);
  assert.equal(fs.statSync(path.join(dir, 'log.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(dir, 'seal.hex')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  const printed = a.stdout + a.stderr;
  assert.ok(!printed.includes(seal)); assert.ok(!printed.includes(JSON.stringify(log.slice(0, 8)).slice(1, -1)));
  assert.match(JSON.parse(a.stdout).logKey, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  const b = spawnSync(process.execPath, ['scripts/keys.mjs'], { cwd: pkg, env, encoding: 'utf8' });
  assert.equal(JSON.parse(b.stdout).logKey, JSON.parse(a.stdout).logKey, 'never overwritten');
  // a fake vercel binary records its argv and stdin
  const rec = path.join(tmpdir(), 'rec');
  fs.mkdirSync(rec, { recursive: true });
  const bin = path.join(rec, 'vercel.sh');
  fs.writeFileSync(bin, `#!/bin/sh\necho "$@" >> ${rec}/argv\ncat >> ${rec}/stdin\n`, { mode: 0o755 });
  const c = spawnSync(process.execPath, ['scripts/keys.mjs', '--vercel'], { cwd: pkg, env: { ...env, VERCEL_BIN: bin }, encoding: 'utf8' });
  assert.equal(c.status, 0, c.stderr);
  const argv = fs.readFileSync(path.join(rec, 'argv'), 'utf8'), stdin = fs.readFileSync(path.join(rec, 'stdin'), 'utf8');
  assert.ok(!argv.includes(seal)); assert.ok(stdin.includes(seal)); assert.ok(argv.includes('env add IA_LOG_KEY production'));
  assert.ok(!(c.stdout + c.stderr).includes(seal));
});
