#!/usr/bin/env node
'use strict';
/**
 * core-lifecycle-br150.test.js — br150-152-registry-cleanup-fixes, module-3
 * (status-core/lifecycle) contract suite.
 *
 * Design §8.2 scenarios covered here:
 *   - (5)  getActiveFeatures with invalid entries skips them, never throws,
 *          and performs a PURE read (registry bytes unchanged).
 *   - (7)  updatePdcaStatus on an archived/completed row refuses loudly with
 *          reason 'E-TERMINAL-WRITE' (FR-05) and leaves the registry
 *          untouched; an explicit 'archived' write still passes (br288
 *          re-archive path preserved).
 *   - (11) removeActiveFeature on drifted state (activeFeatures containing an
 *          object entry + stale primary) completes without throwing (FR-09),
 *          drops the non-string entry, and never promotes a non-string into
 *          primaryFeature.
 *
 * Runs hermetically: CLAUDE_PROJECT_DIR points at a temp dir seeded with a
 * minimal .bkit/state/pdca-status.json. The live .bkit/ registry is never
 * touched (fixture pattern copied from test/unit/pdca-archive-gate.test.js).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br150-'));
process.env.CLAUDE_PROJECT_DIR = projectDir;

const statusDir = path.join(projectDir, '.bkit', 'state');
fs.mkdirSync(statusDir, { recursive: true });
const statusPath = path.join(statusDir, 'pdca-status.json');

function featureRow(patch) {
  return Object.assign({
    phase: 'do',
    phaseNumber: 3,
    matchRate: null,
    iterationCount: 0,
    requirements: [],
    documents: {},
    timestamps: { started: '2026-10-20T00:00:00.000Z' },
  }, patch);
}

function seedStatus(spec) {
  const status = {
    // '3.0' = current schema version; a '2.0' fixture would trip the
    // pre-existing auto-migration write inside getPdcaStatusFull (not the
    // reader under test) and defeat the byte-identical purity assertion.
    version: '3.0',
    lastUpdated: '2026-10-25T00:00:00.000Z',
    activeFeatures: spec.activeFeatures,
    primaryFeature: spec.primaryFeature,
    features: spec.features,
    pipeline: { currentPhase: 1, level: 'Dynamic', phaseHistory: [] },
    session: { startedAt: '2026-10-25T00:00:00.000Z', onboardingCompleted: true },
  };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  invalidateStatusCache();
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

// Modules are loaded AFTER CLAUDE_PROJECT_DIR is set (path SSoT reads env at
// require time via lib/core/platform.js).
const {
  getActiveFeatures,
  removeActiveFeature,
  updatePdcaStatus,
  completePdcaFeature,
} = require('../../lib/pdca/status-core');
const { globalCache } = require('../../lib/core/cache');

// seedStatus() rewrites the registry file per test; the lib caches the parsed
// status per project (3s TTL), so drop the cached copy before each read.
function invalidateStatusCache() {
  globalCache.invalidate(`pdca-status:${projectDir}`);
}

function captureStderr(fn) {
  const buf = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => { buf.push(s); return true; };
  try {
    return { result: fn(), output: buf.join('') };
  } finally {
    process.stderr.write = orig;
  }
}

let pass = 0, fail = 0;
const failures = [];
function tc(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push(`${name} :: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// --- Scenario 5: getActiveFeatures skips invalid entries, pure read --------
tc('scenario 5: getActiveFeatures skips non-string and grammar-invalid entries, no throw', () => {
  seedStatus({
    activeFeatures: ['good-name', 'BAD NAME!', 42, null, { name: 'obj' }, ''],
    primaryFeature: 'good-name',
    features: { 'good-name': featureRow() },
  });
  const before = fs.readFileSync(statusPath, 'utf8');
  const active = getActiveFeatures();
  assert(Array.isArray(active), 'must return an array');
  assert(
    JSON.stringify(active) === JSON.stringify(['good-name']),
    `expected only good-name, got ${JSON.stringify(active)}`
  );
  // Pure read: the drifted registry file must be byte-identical afterwards.
  assert(
    fs.readFileSync(statusPath, 'utf8') === before,
    'getActiveFeatures must not mutate the registry on disk'
  );
});

tc('scenario 5b: getActiveFeatures on missing/non-array activeFeatures returns [] without throw', () => {
  seedStatus({
    activeFeatures: undefined,
    primaryFeature: null,
    features: { 'some-feature': featureRow() },
  });
  const active = getActiveFeatures();
  assert(Array.isArray(active) && active.length === 0, `expected [], got ${JSON.stringify(active)}`);
});

// --- Scenario 7: updatePdcaStatus refuses terminal writes (FR-05) ----------
tc('scenario 7: updatePdcaStatus on archived row returns E-TERMINAL-WRITE refusal, loudly', () => {
  seedStatus({
    activeFeatures: [],
    primaryFeature: null,
    features: {
      'archived-feature': featureRow({
        phase: 'archived',
        archivedTo: 'docs/archive/features/archived-feature.md',
        timestamps: { started: '2026-10-01T00:00:00.000Z', archivedAt: '2026-10-02T00:00:00.000Z' },
      }),
    },
  });
  const { result, output } = captureStderr(() =>
    updatePdcaStatus('archived-feature', 'plan', {}, { requireDocs: false })
  );
  assert(result && result.success === false, `expected success:false, got ${JSON.stringify(result)}`);
  assert(result.reason === 'E-TERMINAL-WRITE', `reason=${result && result.reason}`);
  assert(
    typeof result.hint === 'string' && result.hint.length > 0,
    'refusal must carry a hint'
  );
  // Loud: the refusal must surface on stderr (hooks relay it).
  assert(
    output.includes('E-TERMINAL-WRITE') && output.includes('archived-feature'),
    `stderr refusal missing or too quiet: ${JSON.stringify(output)}`
  );
  // The registry must be untouched: no phase change, no activeFeatures entry,
  // no history entry (br152: six silent skill fires).
  const after = readRegistry();
  assert(after.features['archived-feature'].phase === 'archived', 'phase must stay archived');
  assert(
    JSON.stringify(after.activeFeatures) === '[]',
    `activeFeatures must stay empty, got ${JSON.stringify(after.activeFeatures)}`
  );
  assert(!Array.isArray(after.history) || after.history.length === 0, 'no history entry may be added');
});

tc('scenario 7b: updatePdcaStatus on completed row refuses non-terminal phase', () => {
  seedStatus({
    activeFeatures: [],
    primaryFeature: null,
    features: { 'done-feature': featureRow({ phase: 'completed', phaseNumber: 8 }) },
  });
  const { result } = captureStderr(() =>
    updatePdcaStatus('done-feature', 'do', {}, { requireDocs: false })
  );
  assert(result && result.success === false && result.reason === 'E-TERMINAL-WRITE',
    `expected E-TERMINAL-WRITE refusal, got ${JSON.stringify(result)}`);
  assert(readRegistry().features['done-feature'].phase === 'completed', 'phase must stay completed');
});

tc('scenario 7c: explicit archived-phase write on an archived row still passes (br288 re-archive path)', () => {
  seedStatus({
    activeFeatures: [],
    primaryFeature: null,
    features: {
      'rearchive-me': featureRow({
        phase: 'archived',
        timestamps: { started: '2026-10-01T00:00:00.000Z', archivedAt: '2026-10-02T00:00:00.000Z' },
      }),
    },
  });
  const { result, output } = captureStderr(() =>
    updatePdcaStatus('rearchive-me', 'archived', { archivedTo: 'docs/archive/x.md' }, { requireDocs: false })
  );
  assert(result && result.success === true, `expected success:true, got ${JSON.stringify(result)}`);
  assert(!output.includes('E-TERMINAL-WRITE'), 're-archive must not be refused');
  assert(readRegistry().features['rearchive-me'].phase === 'archived', 'phase must remain archived');
});

tc('scenario 7d: normal phase write on a live feature succeeds and returns success shape', () => {
  seedStatus({
    activeFeatures: ['live-feature'],
    primaryFeature: 'live-feature',
    features: { 'live-feature': featureRow({ phase: 'plan', phaseNumber: 2 }) },
  });
  const { result } = captureStderr(() =>
    updatePdcaStatus('live-feature', 'design', {}, { requireDocs: false })
  );
  assert(result && result.success === true, `expected success:true, got ${JSON.stringify(result)}`);
  assert(readRegistry().features['live-feature'].phase === 'design', 'phase must advance to design');
});

// --- Scenario 11: removeActiveFeature survives drifted state (FR-09) -------
tc('scenario 11: removeActiveFeature with object entry + stale primary completes without throw', () => {
  seedStatus({
    activeFeatures: ['drift-target', { name: 'obj-entry', phase: 'do' }],
    primaryFeature: 'drift-target',
    features: { 'drift-target': featureRow() },
  });
  let threw = null;
  try { removeActiveFeature('drift-target'); } catch (e) { threw = e; }
  assert(!threw, `must not throw, got: ${threw && threw.stack}`);
  const after = readRegistry();
  assert(
    !after.activeFeatures.includes('drift-target'),
    'removed feature must leave activeFeatures'
  );
  assert(
    after.activeFeatures.every((f) => typeof f === 'string'),
    `non-string entries must be dropped, got ${JSON.stringify(after.activeFeatures)}`
  );
  // FR-09 poison guard: primaryFeature must never be (or become) a non-string.
  assert(
    after.primaryFeature === null || typeof after.primaryFeature === 'string',
    `primaryFeature must be string|null, got ${JSON.stringify(after.primaryFeature)}`
  );
});

tc('scenario 11b: removeActiveFeature with missing activeFeatures array does not throw', () => {
  seedStatus({
    activeFeatures: undefined,
    primaryFeature: 'ghost-feature',
    features: { 'ghost-feature': featureRow() },
  });
  let threw = null;
  try { removeActiveFeature('ghost-feature'); } catch (e) { threw = e; }
  assert(!threw, `must not throw, got: ${threw && threw.stack}`);
  const after = readRegistry();
  assert(Array.isArray(after.activeFeatures) && after.activeFeatures.length === 0,
    `activeFeatures must be normalized to [], got ${JSON.stringify(after.activeFeatures)}`);
});

tc('scenario 11c: removeActiveFeature never promotes a non-string primaryFeature', () => {
  seedStatus({
    activeFeatures: ['stay-back', { name: 'obj-entry' }],
    primaryFeature: { name: 'poisoned-primary' },
    features: { 'stay-back': featureRow() },
  });
  let threw = null;
  try { removeActiveFeature('unrelated-name'); } catch (e) { threw = e; }
  assert(!threw, `must not throw, got: ${threw && threw.stack}`);
  const after = readRegistry();
  assert(
    after.primaryFeature === null || typeof after.primaryFeature === 'string',
    `non-string primaryFeature must be healed to a string|null, got ${JSON.stringify(after.primaryFeature)}`
  );
});

// --- Residual (probe-matrix P3): completePdcaFeature must be observable -----
tc('residual P3: completePdcaFeature on drifted stuck-do row returns a result, caller-side slice never throws', () => {
  seedStatus({
    activeFeatures: ['stuck-drift-row', { name: 'obj-entry' }],
    primaryFeature: { name: 'poisoned-primary' },
    features: {
      'stuck-drift-row': featureRow({ phase: 'do', phaseNumber: 3 }),
    },
  });
  // Pre-fix this threw at the CALLER: completePdcaFeature returned undefined,
  // JSON.stringify(undefined) is the value undefined, and `.slice` on it threw
  // "reading 'slice'" (probe-matrix P3 lines, 4/4).
  const ret = completePdcaFeature('stuck-drift-row');
  const sliced = JSON.stringify(ret).slice(0, 60); // exact probe shape — must not throw
  assert(typeof sliced === 'string' && sliced.length > 0, 'return must stringify to a string');
  const parsed = JSON.parse(JSON.stringify(ret));
  assert(parsed.success === true, `expected success:true, got ${JSON.stringify(ret)}`);
  assert(readRegistry().features['stuck-drift-row'].phase === 'completed', 'row must be completed');
});

tc('residual P3b: completePdcaFeature on a name with no registry row returns E-INVALID-STATE, writes nothing', () => {
  seedStatus({
    activeFeatures: ['some-feature'],
    primaryFeature: 'some-feature',
    features: { 'some-feature': featureRow({ phase: 'do' }) },
  });
  const ret = completePdcaFeature('ghost-feature');
  assert(ret && ret.success === false, `expected success:false, got ${JSON.stringify(ret)}`);
  assert(ret.reason === 'E-INVALID-STATE', `reason=${ret && ret.reason}`);
  const after = readRegistry();
  assert(!after.features['ghost-feature'], 'no ghost completed row may be created');
  assert(after.features['some-feature'].phase === 'do', 'unrelated rows must be untouched');
});

tc('residual P3c: completePdcaFeature on an archived row surfaces the E-TERMINAL-WRITE refusal', () => {
  seedStatus({
    activeFeatures: [],
    primaryFeature: null,
    features: {
      'already-archived': featureRow({
        phase: 'archived',
        timestamps: { started: '2026-10-01T00:00:00.000Z', archivedAt: '2026-10-02T00:00:00.000Z' },
      }),
    },
  });
  const { result: ret, output } = captureStderr(() => completePdcaFeature('already-archived'));
  assert(ret && ret.success === false && ret.reason === 'E-TERMINAL-WRITE',
    `expected E-TERMINAL-WRITE refusal, got ${JSON.stringify(ret)}`);
  assert(output.includes('E-TERMINAL-WRITE'), 'refusal must surface on stderr');
  assert(readRegistry().features['already-archived'].phase === 'archived', 'phase must stay archived');
});

// eslint-disable-next-line no-console -- test output convention
console.log(`\ncore-lifecycle-br150.test.js: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
