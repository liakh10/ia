// The log: RFC 9162 hashing and proofs, leaf formats, the append-only store log, idempotent appends, signed heads, cosigning,
// canonical JSON and transcript roots.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { V, store, signer, PROGRAM } from './helpers.mjs';

const { merkle, sha256, hex, unhex, text, fromB58 } = V;
const pid = fromB58(PROGRAM);
const leaves = n => Array.from({ length: n }, (_, i) => merkle.leafHash(text('leaf ' + i)));

test('RFC 9162 known answers: empty tree and one leaf', () => {
  assert.equal(hex(merkle.root([])), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(merkle.root([merkle.leafHash(new Uint8Array())])), '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d');
});

test('every inclusion and every consistency proof verifies for trees of 1..33 leaves, and tampering fails', () => {
  for (let n = 1; n <= 33; n++) {
    const hs = leaves(n), r = merkle.root(hs);
    for (let i = 0; i < n; i++) {
      const p = merkle.inclusionPath(hs, i);
      assert.ok(merkle.verifyInclusion(hs[i], i, n, p, r), `incl ${i}/${n}`);
      assert.ok(!merkle.verifyInclusion(hs[(i + 1) % n === i ? i : (i + 1) % n], i, n, p, r) || n === 1);
    }
    for (let m = 0; m <= n; m++) {
      const p = merkle.consistencyProof(hs, m), r0 = merkle.root(hs, 0, m);
      assert.ok(merkle.verifyConsistency(m, n, r0, r, p), `cons ${m}->${n}`);
      if (m > 0 && m < n) assert.ok(!merkle.verifyConsistency(m, n, sha256(text('x')), r, p), `forged old root ${m}->${n}`);
    }
  }
});

test('every leaf kind round-trips and a non-canonical or trailing-byte leaf is refused', () => {
  const r32 = () => new Uint8Array(crypto.randomBytes(32));
  const all = [
    { kind: 'manifest', seq: 7n, plantClose: 4000n, plants: [{ idx: 0, delivered: true, textHash: r32() }, { idx: 1, delivered: false, textHash: r32() }], bundle: r32() },
    { kind: 'transcript', seq: 7n, agent: 3, docketRoot: r32(), runs: [{ root: r32(), entries: 41, fileHash: r32() }] },
    { kind: 'harness', seq: 7n, harness: r32(), manifest: '{"models":["anthropic/claude-opus-5.5"]}' },
    { kind: 'verdict', seq: 7n, agent: 3, epoch: 1, slot: 99n, tx: new Uint8Array(crypto.randomBytes(64)), purseAtOpen: 5n, bountyTotal: 1n, transcriptRoot: r32(), runs: [{ tier: 6, taken: 5, trail: r32() }] },
    { kind: 'reveal', seq: 7n, idx: 2, class: 1, medium: 4, target: 0n, textHash: r32(), canary: r32(), canarySeed: r32(), textLen: 300 },
    { kind: 'forecast', seq: 7n, agent: 3, call: 1, signer: r32(), signature: new Uint8Array(crypto.randomBytes(64)), slot: 12n },
    { kind: 'redaction', target: 1, keyHash: r32(), contentHash: r32(), reason: 'harmful text' },
  ];
  for (const l of all) {
    const b = V.encodeLeaf(l);
    assert.deepEqual(V.leafJson(V.decodeLeaf(b)), V.leafJson(l), l.kind);
    assert.throws(() => V.decodeLeaf(V.concat(b, Uint8Array.of(0))), /trailing/);
  }
  const bad = V.encodeLeaf(all[0]); bad[0] = 2;
  assert.throws(() => V.decodeLeaf(bad), /version/);
});

test('the store log: appends, signed head, proofs, consistency; two instances on one store never fork or leave a gap', async () => {
  const st = store(), sg = signer();
  const a = new V.TransparencyLog(st, sg, pid), b = new V.TransparencyLog(st, sg, pid);
  const leaf = i => V.encodeLeaf({ kind: 'redaction', target: 1, keyHash: sha256(text('k' + i)), contentHash: new Uint8Array(32), reason: 'r' + i });
  const idx = await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? a : b).append(leaf(i))));
  assert.deepEqual([...idx].sort((x, y) => x - y), Array.from({ length: 24 }, (_, i) => i));
  const h = await a.head();
  assert.equal(h.treeSize, 24);
  assert.ok(V.checkHead(h, sg.address, pid));
  assert.ok(!V.checkHead({ ...h, treeSize: 23 }, sg.address, pid));
  for (const i of [0, 5, 23]) {
    const p = await b.proof(i);
    assert.ok(V.checkInclusion(await b.raw(i), p, h.rootHash));
  }
  const c = await a.consistency(10);
  assert.ok(V.checkConsistency(10, 24, c.firstRoot, h.rootHash, c.path));
  await assert.rejects(a.proof(24), /not inside/);
  await assert.rejects(a.append(new Uint8Array([1, 99])), /unknown leaf kind/);
});

test('appendOnce: one entry per key, a conflicting leaf is refused, a stale marker is recovered', async () => {
  const st = store(), sg = signer(), log = new V.TransparencyLog(st, sg, pid);
  const l1 = V.encodeLeaf({ kind: 'harness', seq: 1n, harness: new Uint8Array(32), manifest: '{}' });
  const l2 = V.encodeLeaf({ kind: 'harness', seq: 1n, harness: new Uint8Array(32).fill(1), manifest: '{}' });
  const x = await log.appendOnce('harness:1', l1), y = await log.appendOnce('harness:1', l1);
  assert.equal(x.index, y.index); assert.ok(x.fresh); assert.ok(!y.fresh);
  await assert.rejects(log.appendOnce('harness:1', l2), e => e.code === 'LOG_CONFLICT');
  // an instance died after appending but before marking done
  const l3 = V.encodeLeaf({ kind: 'harness', seq: 2n, harness: new Uint8Array(32), manifest: '{}' });
  const i3 = await log.append(l3);
  await st.put('log/k/harness:2', text(JSON.stringify({ state: 'appending', leafHash: hex(merkle.leafHash(l3)), at: Date.now() - 200_000 })));
  assert.equal((await log.appendOnce('harness:2', l3)).index, i3);
  assert.equal((await log.head()).treeSize, 2);
  // a fresh marker means another instance is busy
  await st.put('log/k/harness:3', text(JSON.stringify({ state: 'appending', leafHash: 'x', at: Date.now() })));
  await assert.rejects(log.appendOnce('harness:3', l3), e => e.code === 'LOG_BUSY');
});

test('witness cosigning: accepts an extension, refuses a fork, a shrink and a foreign signature', async () => {
  const st = store(), sg = signer(), w = signer(), log = new V.TransparencyLog(st, sg, pid);
  for (let i = 0; i < 5; i++) await log.append(V.encodeLeaf({ kind: 'harness', seq: BigInt(i), harness: new Uint8Array(32), manifest: '{}' }));
  const h5 = await log.head();
  const c1 = V.cosignHead(w, pid, sg.address, h5, null, null, 1000);
  assert.ok(V.checkCosignature(c1, pid));
  for (let i = 5; i < 9; i++) await log.append(V.encodeLeaf({ kind: 'harness', seq: BigInt(i), harness: new Uint8Array(32), manifest: '{}' }));
  const h9 = await log.head(), cons = await log.consistency(5, 9);
  assert.ok(V.cosignHead(w, pid, sg.address, h9, h5, cons.path));
  assert.throws(() => V.cosignHead(w, pid, sg.address, h9, { treeSize: 5, rootHash: hex(sha256(text('fork'))) }, cons.path), e => e.code === 'INCONSISTENT');
  assert.throws(() => V.cosignHead(w, pid, sg.address, h5, h9, []), e => e.code === 'LOG_SHRANK');
  const other = signer();
  assert.throws(() => V.cosignHead(w, pid, other.address, h9, null, null), e => e.code === 'BAD_SIGNATURE');
});

test('RFC 8785: sorted keys, ECMAScript numbers and strings; a non-canonical line is refused', () => {
  assert.equal(V.canon({ b: 1, a: [true, null, 'é\n'], c: { z: 1e21, y: 0.1, x: -0 } }), '{"a":[true,null,"é\\n"],"b":1,"c":{"x":0,"y":0.1,"z":1e+21}}');
  assert.equal(V.canon({ '€': 1, '\r': 2, '1': 3 }), '{"\\r":2,"1":3,"€":1}');
  assert.throws(() => V.parseCanonical('{"b":1,"a":2}'), /canonical/);
  assert.throws(() => V.parseCanonical('{"a": 2}'), /canonical/);
  assert.deepEqual(V.parseCanonical('{"a":2}'), { a: 2 });
});

test('transcript roots: run root over entries, docket root over run roots, the same as runner/lib/merkle.mjs', async () => {
  const lines = [{ i: 0, kind: 'meta', body: { seq: 3, agent: 1, run: 0 } }, { i: 1, kind: 'tool_call', body: { name: 'read_inbox', input: {} } }].map(V.canon);
  const pr = V.parseRun(lines.join('\n') + '\n', { seq: 3, agent: 1, run: 0 });
  assert.equal(pr.entries.length, 2);
  let runner;
  try { runner = await import('../../runner/lib/merkle.mjs'); } catch {}
  if (runner) {
    assert.equal(hex(pr.runRoot), runner.mth(lines.map(l => Buffer.from(l))).toString('hex'));
    assert.equal(hex(V.docketRoot([pr.runRoot, pr.runRoot])), runner.mth([Buffer.from(pr.runRoot), Buffer.from(pr.runRoot)]).toString('hex'));
  }
  assert.throws(() => V.parseRun(lines.join('\n'), { seq: 3, agent: 2, run: 0 }), /meta entry names/);
  assert.throws(() => V.parseRun([lines[1], lines[0]].join('\n')), /entry 0 has i/);
  assert.equal(hex(V.stepOf(lines[1])), hex(sha256(text(lines[1]))));
});
