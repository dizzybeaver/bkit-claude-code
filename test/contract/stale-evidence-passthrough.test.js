#!/usr/bin/env node
/*
 * Contract test — Stale-evidence passthrough (br138 / stale-evidence-passthrough)
 *
 * Design Ref: docs/02-design/features/br138-stale-evidence-passthrough.design.en.md §7
 * Covers: scripts/pdca-skill-stop.js shouldSkipAutoTransition (functional, temp
 * fixture registries), scripts/unified-stop.js gate (0)/(d) (source-level —
 * unified-stop is a hook entrypoint; requiring it executes the hook body
 * against real stdin, so behavior is asserted as a source contract per the
 * br143 suite convention in test/contract/session-activity-gate.test.js).
 *
 * Convention note: standalone node script with pass/fail counters; repo has
 * no jest for test/contract/ (see cc-bridge.test.js).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');

// PROJECT_DIR is latched at lib/core/platform module load (first lazy require
// inside the gate chain), so the env var MUST be set before any scenario runs.
// All fixtures live under this temp root for the lifetime of the process.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'br138-contract-'));
process.env.CLAUDE_PROJECT_DIR = TMP;

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

const gate = require(path.join(ROOT, 'lib', 'pdca', 'session-activity-gate'));

const STATE_DIR = path.join(TMP, '.bkit', 'state');
const STATUS_PATH = path.join(STATE_DIR, 'pdca-status.json');
const recent = () => new Date(Date.now() - 60_000).toISOString();

/** Purge cached lib modules so the 3s TTL status cache never serves stale fixtures. */
function resetLibCache() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(ROOT)) delete require.cache[k];
  }
}

/** Fresh script module per scenario (post-purge, no stale registry cache). */
function loadPdcaStop() {
  resetLibCache();
  return require(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'));
}

function writeRegistry(features) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify({
    version: '3.0',
    features,
  }, null, 2));
}

/** Clean fixture tree (registry + docs) between scenarios. */
function cleanFixtures() {
  fs.rmSync(path.join(TMP, '.bkit'), { recursive: true, force: true });
  fs.rmSync(path.join(TMP, 'docs'), { recursive: true, force: true });
}

function writeEvidence(dirSub, name) {
  const d = path.join(TMP, ...dirSub.split('/'));
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${name}.design.md`), '# fixture evidence\n');
}

console.log('=== Stale-evidence passthrough contract test (br138) ===');

// ---------------------------------------------------------------
// TS-1 — no-activity session: registry has foreign + legacy
// transitionable features; this session owns nothing → gate (0)
// short-circuits: silent {skip:false, gate:null}, no withhold verdict.
// ---------------------------------------------------------------
test('TS-1: no-activity session over foreign/legacy transitionable registry → silent skip:false', () => {
  cleanFixtures();
  writeRegistry({
    foreignfeat: { ownerSession: 'sess-other', ownerSince: recent(), phase: 'design' },
    legacyfeat: { phase: 'check' }, // legacy: no ownerSession stamp
  });
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({ session_id: 'sess-me' });
  assert.deepStrictEqual(r, { skip: false, gate: null });
  assert.notStrictEqual(r.gate, 'stale-evidence');
});

// ---------------------------------------------------------------
// TS-2 — owning session + owned feature in a transitionable phase with
// the phase doc MISSING on disk → stale-evidence withhold.
// ---------------------------------------------------------------
test('TS-2: owned feature, phase doc missing → {skip:true, gate:stale-evidence}', () => {
  cleanFixtures();
  writeRegistry({
    myfeat: { ownerSession: 'sess-me', ownerSince: recent(), phase: 'design' },
  });
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({ session_id: 'sess-me' });
  assert.deepStrictEqual(r, { skip: true, gate: 'stale-evidence' });
});

// ---------------------------------------------------------------
// TS-3 — owning session + evidence on disk → auto-transition allowed.
// ---------------------------------------------------------------
test('TS-3: owned feature, evidence on disk → {skip:false, gate:null}', () => {
  cleanFixtures();
  writeRegistry({
    myfeat: { ownerSession: 'sess-me', ownerSince: recent(), phase: 'design' },
  });
  writeEvidence('docs/02-design/features', 'myfeat');
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({ session_id: 'sess-me' });
  assert.deepStrictEqual(r, { skip: false, gate: null });
});

// ---------------------------------------------------------------
// TS-4 — the br138 repro: foreign session + evidence-less transitionable
// registry → silent skip:false (gate (0) short-circuit). The old global
// candidate set classified foreign residue as 'stale-evidence'.
// ---------------------------------------------------------------
test('TS-4: foreign session + evidence-less transitionable registry → silent skip:false (no stale-evidence)', () => {
  cleanFixtures();
  writeRegistry({
    foreignfeat: { ownerSession: 'sess-other', ownerSince: recent(), phase: 'check' },
  });
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({ session_id: 'sess-me' });
  assert.deepStrictEqual(r, { skip: false, gate: null });
  assert.notStrictEqual(r.gate, 'stale-evidence');
});

test('TS-4b: legacy (unowned) transitionable entry is also not stale-evidence for a foreign session', () => {
  cleanFixtures();
  writeRegistry({ legacyfeat: { phase: 'plan' } });
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({ session_id: 'sess-me' });
  assert.deepStrictEqual(r, { skip: false, gate: null });
});

// ---------------------------------------------------------------
// TS-6 — pause-flag / background-work / specialist-agent gates are
// unchanged for an OWNING session (gate (0) passes through, earlier
// gates win before stale-evidence is even evaluated).
// ---------------------------------------------------------------
test('TS-6a: owning session + pause flag → pause-flag (checked before stale-evidence)', () => {
  cleanFixtures();
  writeRegistry({
    myfeat: { ownerSession: 'sess-me', ownerSince: recent(), phase: 'qa' },
  });
  fs.writeFileSync(path.join(STATE_DIR, 'pdca-pause'), '');
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({ session_id: 'sess-me' });
  assert.deepStrictEqual(r, { skip: true, gate: 'pause-flag' });
});

test('TS-6b: owning session + background_tasks → background-work', () => {
  cleanFixtures();
  writeRegistry({
    myfeat: { ownerSession: 'sess-me', ownerSince: recent(), phase: 'qa' },
  });
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({
    session_id: 'sess-me',
    background_tasks: ['task-1'],
  });
  assert.deepStrictEqual(r, { skip: true, gate: 'background-work' });
});

test('TS-6c: owning session + specialist agent → specialist-agent', () => {
  cleanFixtures();
  writeRegistry({
    myfeat: { ownerSession: 'sess-me', ownerSince: recent(), phase: 'qa' },
  });
  const stop = loadPdcaStop();
  const r = stop.shouldSkipAutoTransition({
    session_id: 'sess-me',
    agent_name: 'bkit:gap-detector',
  });
  assert.deepStrictEqual(r, { skip: true, gate: 'specialist-agent' });
});

// ---------------------------------------------------------------
// Require-level — br143's shared session-activity gate module is still
// what the script uses (no drift back to a local copy).
// ---------------------------------------------------------------
test('pdca-skill-stop re-exports OWNER_LEASE_MS equal to the shared gate module', () => {
  const stop = loadPdcaStop();
  assert.strictEqual(stop.OWNER_LEASE_MS, gate.OWNER_LEASE_MS);
});

test('shouldAutoTransition still delegates to the shared gate verdict table', () => {
  const stop = loadPdcaStop();
  const NOW = Date.now();
  const cases = [
    [{ phase: 'do' }, 'sess-me'],                                        // unowned
    [{ ownerSession: 'sess-other', ownerSince: recent() }, 'sess-me'],   // foreign
    [{ ownerSession: 'sess-me', ownerSince: recent() }, 'sess-me'],      // owner allow
    [null, 'sess-me'],                                                   // no-activity
  ];
  for (const [entry, sid] of cases) {
    assert.deepStrictEqual(
      stop.shouldAutoTransition(entry, sid, NOW),
      gate.evaluateSessionGate(entry, sid, NOW),
      `entry=${JSON.stringify(entry)} sid=${sid}`
    );
  }
});

// ---------------------------------------------------------------
// TS-7 — both stop paths produce equivalent verdicts on identical
// fixtures. unified-stop.js cannot be required (hook entrypoint body),
// so equivalence is asserted as a source contract: same shared gate
// module, same session-scoped candidate set, same verdict shapes.
// (This mirrors the br143 suite's gate-(e) wiring convention.)
// ---------------------------------------------------------------
const unifiedSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'unified-stop.js'), 'utf8');
const pdcaStopSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'), 'utf8');

const PHASE_DOC_DIRS = ['docs/01-plan/features', 'docs/02-design/features', 'docs/03-analysis', 'docs/04-report/features', 'docs/05-qa'];

test('TS-7a: both scripts require the shared session-activity gate module', () => {
  for (const [name, src] of [['unified-stop', unifiedSrc], ['pdca-skill-stop', pdcaStopSrc]]) {
    assert.ok(
      src.includes("require('../lib/pdca/session-activity-gate')"),
      `${name} must import lib/pdca/session-activity-gate`
    );
  }
});

test('TS-7b: both scripts carry the br138 gate-(0) chain-top short-circuit', () => {
  for (const [name, src] of [['unified-stop', unifiedSrc], ['pdca-skill-stop', pdcaStopSrc]]) {
    assert.ok(src.includes('(0) br138:'), `${name} must mark the br138 short-circuit`);
    assert.ok(
      src.includes('return { skip: false, gate: null };'),
      `${name} short-circuit must silently pass through`
    );
    assert.ok(
      src.includes('evaluateSessionGate('),
      `${name} must classify ownership via the shared gate`
    );
  }
});

test('TS-7c: both scripts scope the stale-evidence candidate set to the session', () => {
  for (const [name, src] of [['unified-stop', unifiedSrc], ['pdca-skill-stop', pdcaStopSrc]]) {
    assert.ok(
      src.includes('br138: candidate set session-scoped'),
      `${name} must carry the br138 session-scoping comment`
    );
    assert.ok(
      src.includes("return { skip: true, gate: 'stale-evidence' };"),
      `${name} stale-evidence verdict shape must match`
    );
  }
});

test('TS-7d: both scripts use the identical phase-doc directory map', () => {
  for (const [name, src] of [['unified-stop', unifiedSrc], ['pdca-skill-stop', pdcaStopSrc]]) {
    for (const dir of PHASE_DOC_DIRS) {
      assert.ok(src.includes(`'${dir}'`), `${name} missing phase dir '${dir}'`);
    }
  }
});

test('TS-7e: unified-stop gate (e) br143 wiring intact (shared reason prefix + fail-closed)', () => {
  assert.ok(
    unifiedSrc.includes('gate: `session-activity/${verdict.reason}`'),
    'gate (e) must carry the session-activity/<reason> prefix'
  );
  assert.ok(
    unifiedSrc.includes("gate: 'session-activity/error'"),
    'gate (e) catch path must withhold with session-activity/error'
  );
});

// ---------------------------------------------------------------
// Cleanup + summary
// ---------------------------------------------------------------
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (e) {
  console.error(`  ! cleanup warning: ${e.message}`);
}

const total = pass + fail;
console.log(`\nTests: ${pass}/${total} PASSED, ${fail} FAILED, 0 SKIPPED`);
process.exit(fail > 0 ? 1 : 0);
