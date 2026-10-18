#!/usr/bin/env node
/*
 * Contract test — Session-activity gate (br143 / stop-hook-session-isolation)
 *
 * Design Ref: docs/02-design/features/stop-hook-session-isolation.design.en.md §8.2
 * Covers: lib/pdca/session-activity-gate.js (unit), pdca-skill-stop.js
 * delegation contract, unified-stop.js gate-(e) wiring contract (source-level).
 *
 * Convention note: test/contract/*.test.js in this repo are standalone node
 * scripts with pass/fail counters (see cc-bridge.test.js); jest.config only
 * targets test-scripts/. This file follows the same standalone convention.
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const gate = require(path.join(ROOT, 'lib', 'pdca', 'session-activity-gate'));
const pdcaStop = require(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'));

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}\n      ${e && e.message}`);
  }
}

const NOW = 1_800_000_000_000; // fixed epoch ms (2027-ish); injectable clock
const LEASE = gate.OWNER_LEASE_MS;
const iso = (ms) => new Date(ms).toISOString();

console.log('=== Session-activity gate contract test (br143) ===');

// ---------------------------------------------------------------
// 1. Unit — evaluateSessionGate verdict table (design §8.2)
// ---------------------------------------------------------------
test('TS-1: unowned entry (no ownerSession) → withhold unowned', () => {
  const v = gate.evaluateSessionGate({ phase: 'do' }, 'sess-A', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'unowned' });
});

test('TS-1b: legacy entry with empty-string ownerSession → unowned (not owner)', () => {
  const v = gate.evaluateSessionGate({ ownerSession: '' }, 'sess-A', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'unowned' });
});

test('TS-2: foreign session within lease → withhold foreign-session', () => {
  const entry = { ownerSession: 'sess-A', ownerSince: iso(NOW - 60_000) };
  const v = gate.evaluateSessionGate(entry, 'sess-B', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'foreign-session' });
});

test('TS-3a: owner match within lease → allow owner', () => {
  const entry = { ownerSession: 'sess-A', ownerSince: iso(NOW - 60_000) };
  const v = gate.evaluateSessionGate(entry, 'sess-A', NOW);
  assert.deepStrictEqual(v, { allowed: true, reason: 'owner' });
});

test('TS-3b: owner match OLDER than lease → still allow owner (rule 4 before lease check)', () => {
  const entry = { ownerSession: 'sess-A', ownerSince: iso(NOW - LEASE - 86_400_000) };
  const v = gate.evaluateSessionGate(entry, 'sess-A', NOW);
  assert.deepStrictEqual(v, { allowed: true, reason: 'owner' });
});

test('TS-4: foreign session past lease → withhold lease-expired', () => {
  const entry = { ownerSession: 'sess-A', ownerSince: iso(NOW - LEASE - 1) };
  const v = gate.evaluateSessionGate(entry, 'sess-B', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'lease-expired' });
});

test('lease boundary: exactly OWNER_LEASE_MS old → foreign-session (strict >)', () => {
  const entry = { ownerSession: 'sess-A', ownerSince: iso(NOW - LEASE) };
  const v = gate.evaluateSessionGate(entry, 'sess-B', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'foreign-session' });
});

test('TS-9: missing current session id → withhold no-session-id (checked first)', () => {
  for (const sid of [null, undefined, '']) {
    const v = gate.evaluateSessionGate({ ownerSession: 'sess-A' }, sid, NOW);
    assert.deepStrictEqual(v, { allowed: false, reason: 'no-session-id' }, `sid=${JSON.stringify(sid)}`);
  }
});

test('null entry → withhold no-activity', () => {
  const v = gate.evaluateSessionGate(null, 'sess-A', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'no-activity' });
});

test('missing entry argument → withheld (no-activity), never allowed', () => {
  const v = gate.evaluateSessionGate(undefined, 'sess-A', NOW);
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.reason, 'no-activity');
});

test('TS-10: malformed ownerSince (NaN parse) → withhold malformed-entry', () => {
  const entry = { ownerSession: 'sess-A', ownerSince: 'not-a-date' };
  const v = gate.evaluateSessionGate(entry, 'sess-B', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'malformed-entry' });
});

test('foreign owner with ownerSince absent → malformed-entry (Date.parse(undefined) is NaN)', () => {
  const v = gate.evaluateSessionGate({ ownerSession: 'sess-A' }, 'sess-B', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'malformed-entry' });
});

test('entry whose property access throws → withheld malformed-entry (never throws)', () => {
  const hostile = new Proxy({}, {
    get() { throw new Error('boom'); },
  });
  const v = gate.evaluateSessionGate(hostile, 'sess-A', NOW);
  assert.deepStrictEqual(v, { allowed: false, reason: 'malformed-entry' });
});

// ---------------------------------------------------------------
// 2. withholdNote — formatting + purity
// ---------------------------------------------------------------
test('withholdNote embeds gate prefix session-activity/<reason>', () => {
  const note = gate.withholdNote('unowned', 'sess-A');
  assert.ok(note.includes('session-activity/unowned'), note);
});

test('withholdNote appends session=<id> when sessionId given', () => {
  const note = gate.withholdNote('foreign-session', 'sess-B');
  assert.ok(note.includes('session=sess-B'), note);
});

test('withholdNote omits session= suffix when sessionId omitted', () => {
  const note = gate.withholdNote('lease-expired');
  assert.ok(!note.includes('session='), note);
  assert.ok(note.includes('session-activity/lease-expired'), note);
});

test('withholdNote is pure/deterministic (no writes; identical on repeat call)', () => {
  const a = gate.withholdNote('unowned', 'sess-X');
  const b = gate.withholdNote('unowned', 'sess-X');
  assert.strictEqual(a, b);
  assert.strictEqual(typeof a, 'string');
});

// ---------------------------------------------------------------
// 3. Contract — pdca-skill-stop.js delegation (sibling-path drift guard)
// ---------------------------------------------------------------
test('pdca-skill-stop re-exports OWNER_LEASE_MS equal to the gate module', () => {
  assert.strictEqual(pdcaStop.OWNER_LEASE_MS, gate.OWNER_LEASE_MS);
});

test('pdca-skill-stop exports shouldAutoTransition as a function', () => {
  assert.strictEqual(typeof pdcaStop.shouldAutoTransition, 'function');
});

test('shouldAutoTransition delegates: same verdict table as evaluateSessionGate', () => {
  const cases = [
    // [entry, currentSessionId]
    [{ phase: 'do' }, 'sess-A'],                                   // unowned
    [{ ownerSession: 'sess-A', ownerSince: iso(NOW - 1000) }, 'sess-B'], // foreign
    [{ ownerSession: 'sess-A', ownerSince: iso(NOW - 1000) }, 'sess-A'], // owner allow
    [{ ownerSession: 'sess-A', ownerSince: iso(NOW - LEASE - 5) }, 'sess-B'], // lease-expired
    [{ ownerSession: 'sess-A', ownerSince: 'garbage' }, 'sess-B'], // malformed
    [null, 'sess-A'],                                              // no-activity
  ];
  for (const pair of cases) {
    const entry = pair[0];
    const sid = pair[1];
    const got = pdcaStop.shouldAutoTransition(entry, sid, NOW);
    const want = gate.evaluateSessionGate(entry, sid, NOW);
    assert.deepStrictEqual(got, want, `entry=${JSON.stringify(entry)} sid=${sid}`);
  }
});

// ---------------------------------------------------------------
// 4. Contract — unified-stop.js gate (e) wiring (source-level)
//    NOTE: unified-stop.js is a hook entrypoint (no require-safe exports;
//    requiring it executes the hook body against real stdin), so the gate
//    chain branch is asserted as a source contract here; behavior is
//    covered by the shared-module unit tests above.
// ---------------------------------------------------------------
const unifiedSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'unified-stop.js'), 'utf8');

test('unified-stop requires the shared session-activity gate module', () => {
  assert.ok(
    unifiedSrc.includes("require('../lib/pdca/session-activity-gate')"),
    'unified-stop.js must import lib/pdca/session-activity-gate'
  );
});

test('unified-stop gate (e) returns skip with session-activity/<reason> prefix', () => {
  assert.ok(
    unifiedSrc.includes('gate: `session-activity/${verdict.reason}`'),
    'skip result must carry the shared gate reason prefix'
  );
});

test('unified-stop gate (e) is fail-closed on error (session-activity/error)', () => {
  assert.ok(
    unifiedSrc.includes("gate: 'session-activity/error'"),
    'catch path must withhold with session-activity/error'
  );
});

test('unified-stop iterates ALL registry features (stale-evidence candidate set)', () => {
  assert.ok(
    unifiedSrc.includes('status?.features || {}'),
    'gate (e) must scan every feature entry, not just the resolved one'
  );
});

// Summary
const total = pass + fail;
console.log(`\nTests: ${pass}/${total} PASSED, ${fail} FAILED, 0 SKIPPED`);
process.exit(fail > 0 ? 1 : 0);
