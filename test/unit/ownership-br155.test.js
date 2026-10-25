/**
 * ownership-br155.test.js — br155 registration-ownership unit suite (design §8.2)
 *
 * Scenarios covered (per module-4 brief):
 *   3  — registerFeature refuses scoped CLI leftovers (FR-02, E-NAME-INVALID)
 *   6  — duplicate normalized name refused (FR-04, E-DUP-REGISTER)
 *   9  — registration stamps ownerSession when CLAUDE_CODE_SESSION_ID set,
 *        omits it when absent (FR-07) — both via registerFeature AND via the
 *        REAL creation path (lib/pdca/status-core.js updatePdcaStatus row
 *        constructor, the single chokepoint every creator routes through)
 *   10 — Stop-path ownership claim is evidence-gated (FR-08): a non-firing
 *        session's Stop writes NO ownerSession
 *   12 — emission coverage (FR-10): the session-activity gate is actually
 *        consulted by the emission entry points (spy + source-level wiring)
 * plus the br151 reader-resilience check for getActiveFeatures (FR-03).
 *
 * Fixture pattern copied from test/unit/name-paths-br151.test.js (temp dirs,
 * require.cache mocks). node:test runner per the test/unit/ convention
 * (jest.config.js matches test-scripts/ only). /tmp fixtures only — the live
 * .bkit/ tree is never touched (lib/pdca/status and lib/core are mocked).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');

// Temp project dir so no real .bkit state is touched
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br155-test-'));
const fakeProjDir = path.join(tmpDir, 'project');
fs.mkdirSync(fakeProjDir, { recursive: true });

// Real (pure) canonical name validator — no mocks needed for it
const { validateFeatureName } = require(path.join(ROOT, 'lib', 'core', 'name-validator'));

// In-memory fake for lib/pdca/status — feature-manager consumes only this
// surface via getStatus(); recording updatePdcaStatus calls gives us the
// FR-07/FR-04 write-side assertions without any filesystem registry.
function makeFakeStatus(initial = {}) {
  const state = {
    features: JSON.parse(JSON.stringify(initial.features || {})),
    activeFeatures: [...(initial.activeFeatures || [])],
    primaryFeature: initial.primaryFeature || null,
  };
  const calls = { updatePdcaStatus: [] };
  return {
    state,
    calls,
    getActiveFeatures: () => [...state.activeFeatures],
    getFeatureStatus: (f) => state.features[f] || null,
    addActiveFeature: (f, setPrimary) => {
      if (!state.activeFeatures.includes(f)) state.activeFeatures.push(f);
      if (setPrimary) state.primaryFeature = f;
    },
    removeActiveFeature: (f) => {
      state.activeFeatures = state.activeFeatures.filter((x) => x !== f);
    },
    getPdcaStatusFull: () => ({
      features: state.features,
      activeFeatures: state.activeFeatures,
      primaryFeature: state.primaryFeature,
    }),
    updatePdcaStatus: (f, phase, data = {}, opts = {}) => {
      calls.updatePdcaStatus.push({ feature: f, phase, data, opts });
      state.features[f] = Object.assign(
        {}, state.features[f] || { timestamps: {} }, { phase }, data
      );
      return state;
    },
  };
}

// Mock lib/core (feature-manager's getCore()) — fake debugLog/stateStore over
// the real canonical validateFeatureName, PROJECT_DIR in /tmp.
const corePath = require.resolve('../../lib/core');
const origCore = require.cache[corePath];
require.cache[corePath] = {
  id: corePath,
  filename: corePath,
  loaded: true,
  exports: {
    PROJECT_DIR: fakeProjDir,
    debugLog: () => {},
    validateFeatureName,
    stateStore: { write: () => {} },
  },
};

// Mock lib/pdca/status with a fresh fake per require of feature-manager
const statusPath = require.resolve('../../lib/pdca/status');
const fmPath = require.resolve('../../lib/pdca/feature-manager');
const origStatusEntry = require.cache[statusPath];
delete require.cache[fmPath];

function loadFmWith(fakeStatus) {
  delete require.cache[fmPath];
  delete require.cache[statusPath];
  require.cache[statusPath] = {
    id: statusPath,
    filename: statusPath,
    loaded: true,
    exports: fakeStatus,
  };
  return require('../../lib/pdca/feature-manager');
}

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete require.cache[fmPath];
  if (origStatusEntry) require.cache[statusPath] = origStatusEntry;
  else delete require.cache[statusPath];
  if (origCore) require.cache[corePath] = origCore;
  else delete require.cache[corePath];
});

const withSessionEnv = (val, fn) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'CLAUDE_CODE_SESSION_ID');
  const prev = process.env.CLAUDE_CODE_SESSION_ID;
  if (val === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
  else process.env.CLAUDE_CODE_SESSION_ID = val;
  try {
    return fn();
  } finally {
    if (had) process.env.CLAUDE_CODE_SESSION_ID = prev;
    else delete process.env.CLAUDE_CODE_SESSION_ID;
  }
};

// --- Scenario 3 (FR-02): invalid registration names refused ---

test('S3.1: registerFeature refuses "name --scope module-1" with E-NAME-INVALID', () => {
  const st = makeFakeStatus();
  const fm = loadFmWith(st);
  const res = fm.registerFeature('name --scope module-1');
  assert.equal(res.registered, false);
  assert.equal(res.reason, 'E-NAME-INVALID');
  assert.equal(res.featureState, null);
  // No registry write may happen for a refused name
  assert.equal(st.calls.updatePdcaStatus.length, 0);
  assert.equal(st.state.activeFeatures.length, 0);
});

test('S3.2: registerFeature refuses other grammar failures with E-NAME-INVALID', () => {
  const fm = loadFmWith(makeFakeStatus());
  assert.equal(fm.registerFeature('../evil').reason, 'E-NAME-INVALID');
  assert.equal(fm.registerFeature('feat (v2)').reason, 'E-NAME-INVALID');
  assert.equal(fm.registerFeature('').reason, 'E-NAME-INVALID');
  assert.equal(fm.registerFeature(null).reason, 'E-NAME-INVALID');
});

// --- Scenario 6 (FR-04): duplicate normalized names refused ---

test('S6.1: registerFeature refuses an existing ACTIVE feature (E-DUP-REGISTER)', () => {
  const st = makeFakeStatus({
    features: { 'dup-feat': { phase: 'plan', timestamps: {} } },
    activeFeatures: ['dup-feat'],
    primaryFeature: 'dup-feat',
  });
  const fm = loadFmWith(st);
  const res = fm.registerFeature('dup-feat');
  assert.equal(res.registered, false);
  assert.equal(res.reason, 'E-DUP-REGISTER');
  assert.equal(st.calls.updatePdcaStatus.length, 0);
});

test('S6.2: registerFeature refuses a normalized-case duplicate of an ACTIVE feature', () => {
  const st = makeFakeStatus({
    features: { 'my-feat': { phase: 'do', timestamps: {} } },
    activeFeatures: ['my-feat'],
  });
  const fm = loadFmWith(st);
  // "My_Feat" normalizes to "my-feat" — same registry row
  const res = fm.registerFeature('My_Feat');
  assert.equal(res.registered, false);
  assert.equal(res.reason, 'E-DUP-REGISTER');
});

test('S6.3: registerFeature refuses an ARCHIVED feature name (E-DUP-REGISTER)', () => {
  const st = makeFakeStatus({
    features: {
      'old-feat': { phase: 'archived', archivedAt: '2026-10-01T00:00:00Z', timestamps: {} },
    },
    activeFeatures: [],
  });
  const fm = loadFmWith(st);
  const res = fm.registerFeature('old-feat');
  assert.equal(res.registered, false);
  assert.equal(res.reason, 'E-DUP-REGISTER');
});

// --- Scenario 9 (FR-07): registration stamps the firing session ---

test('S9.1: CLAUDE_CODE_SESSION_ID set → feature row write carries ownerSession/ownerSince', () => {
  const st = makeFakeStatus();
  const fm = loadFmWith(st);
  const res = withSessionEnv('sess-br155-9', () => fm.registerFeature('brand-new-feat'));
  assert.equal(res.registered, true);
  const stamps = st.calls.updatePdcaStatus.filter((c) => c.data && c.data.ownerSession);
  assert.equal(stamps.length, 1, 'exactly one ownership-stamped write');
  assert.equal(stamps[0].feature, 'brand-new-feat');
  assert.equal(stamps[0].data.ownerSession, 'sess-br155-9');
  assert.equal(typeof stamps[0].data.ownerSince, 'string');
  assert.ok(!Number.isNaN(Date.parse(stamps[0].data.ownerSince)));
});

test('S9.2: CLAUDE_CODE_SESSION_ID absent → no ownerSession key, registration still succeeds', () => {
  const st = makeFakeStatus();
  const fm = loadFmWith(st);
  const res = withSessionEnv(undefined, () => fm.registerFeature('envless-feat'));
  assert.equal(res.registered, true, 'absent env var must not fail registration');
  for (const c of st.calls.updatePdcaStatus) {
    assert.equal('ownerSession' in c.data, false, 'no ownership stamp without a session id');
  }
});

// --- Scenario 10 (FR-08): Stop-path claim is evidence-gated ---

test('S10.1: pdca-skill-stop exports resolveOwnershipStamp (pure, testable)', () => {
  const pdcaStop = require('../../scripts/pdca-skill-stop.js');
  assert.equal(typeof pdcaStop.resolveOwnershipStamp, 'function');
});

test('S10.2: non-firing session (no envelope) claims NO ownership', () => {
  const { resolveOwnershipStamp } = require('../../scripts/pdca-skill-stop.js');
  const stamp = resolveOwnershipStamp(null, 'feat-a', 'sess-B');
  assert.deepEqual(stamp, {}, 'a Stop with no transcript fire evidence must not adopt');
});

test('S10.3: firing session with matching feature takes/keeps the lease', () => {
  const { resolveOwnershipStamp } = require('../../scripts/pdca-skill-stop.js');
  const stamp = resolveOwnershipStamp(
    { action: 'plan', feature: 'feat-a' }, 'feat-a', 'sess-A', new Date(1_800_000_000_000)
  );
  assert.deepEqual(stamp, {
    ownerSession: 'sess-A',
    ownerSince: new Date(1_800_000_000_000).toISOString(),
  });
});

test('S10.4: envelope naming a DIFFERENT feature does not stamp the bound feature', () => {
  const { resolveOwnershipStamp } = require('../../scripts/pdca-skill-stop.js');
  const stamp = resolveOwnershipStamp(
    { action: 'plan', feature: 'feat-b' }, 'feat-a', 'sess-A'
  );
  assert.deepEqual(stamp, {});
});

test('S10.5: feature-less fire (/pdca plan) bound via registry tiers still stamps', () => {
  const { resolveOwnershipStamp } = require('../../scripts/pdca-skill-stop.js');
  const stamp = resolveOwnershipStamp({ action: 'plan', feature: null }, 'feat-a', 'sess-A');
  assert.equal(stamp.ownerSession, 'sess-A');
});

test('S10.6: no session id → no stamp, even with fire evidence', () => {
  const { resolveOwnershipStamp } = require('../../scripts/pdca-skill-stop.js');
  assert.deepEqual(
    resolveOwnershipStamp({ action: 'plan', feature: 'feat-a' }, 'feat-a', null),
    {}
  );
});

test('S10.7: the unconditional claim is gone from the phase-write source', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'), 'utf8');
  assert.equal(src.includes('ownerSession: fireSessionId,'), false,
    'unconditional ownerSession claim must not reappear');
  assert.equal(src.includes('...resolveOwnershipStamp(envelope, feature, fireSessionId)'), true,
    'phase write must route the stamp through the evidence gate');
});

// --- Scenario 12 (FR-10): emission paths consult the session-activity gate ---

test('S12.1: shouldAutoTransition delegates to evaluateSessionGate (spy: consulted)', () => {
  const gatePath = require.resolve('../../lib/pdca/session-activity-gate');
  const realGate = require(gatePath);
  const origGateEntry = require.cache[gatePath];
  let gateCalls = 0;
  require.cache[gatePath] = {
    id: gatePath,
    filename: gatePath,
    loaded: true,
    exports: Object.assign({}, realGate, {
      evaluateSessionGate: (...args) => {
        gateCalls++;
        return realGate.evaluateSessionGate(...args);
      },
    }),
  };
  try {
    const stopPath = require.resolve('../../scripts/pdca-skill-stop.js');
    delete require.cache[stopPath];
    const pdcaStop = require('../../scripts/pdca-skill-stop.js');
    const before = gateCalls;
    const verdict = pdcaStop.shouldAutoTransition(
      { ownerSession: 'sess-A', ownerSince: new Date().toISOString() }, 'sess-A'
    );
    assert.deepEqual(verdict, { allowed: true, reason: 'owner' });
    assert.ok(gateCalls > before,
      'evaluateSessionGate must be consulted — an inline copy is a bypass');
    delete require.cache[stopPath];
  } finally {
    if (origGateEntry) require.cache[gatePath] = origGateEntry;
    else delete require.cache[gatePath];
  }
});

test('S12.2: pdca-skill-stop directive emissions are ownership-gated (source wiring)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'pdca-skill-stop.js'), 'utf8');
  // AUTO-TRANSITION demand only inside the ownership-allowed branch
  assert.ok(src.includes('if (nextCommand && ownership.allowed)'),
    'AUTO-TRANSITION demand must sit behind the ownership verdict');
  // br155 FR-10: PDCA-COMPLETE directive must clear the same gate
  assert.ok(src.includes('completeOwnership.allowed'),
    'PDCA-COMPLETE directive must be ownership-gated');
});

test('S12.3: unified-stop next-action hint consults evaluateSessionGate (source wiring)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'unified-stop.js'), 'utf8');
  const start = src.indexOf('let nextActionHint');
  const end = src.indexOf("isAdvisoryEnabled('ackMessages')", start);
  assert.ok(start !== -1 && end !== -1, 'next-action hint block found');
  const block = src.slice(start, end);
  assert.ok(block.includes('evaluateSessionGate('),
    'hint path must call the shared gate — skipping it emits foreign-feature guidance');
  assert.ok(block.includes('.allowed'),
    'hint emission must depend on the gate verdict');
});

// --- br151 reader resilience (FR-03) ---

test('FR-03: getActiveFeatures flags junk active names instead of throwing', () => {
  const st = makeFakeStatus({
    features: {
      'good-feat': { phase: 'plan', timestamps: { started: '2026-10-25T00:00:00Z' } },
      // junk entry: scoped CLI leftover that reached activeFeatures (br151)
      'x --scope module-1': { phase: 'pm', timestamps: {} },
    },
    activeFeatures: ['good-feat', 'x --scope module-1'],
    primaryFeature: 'good-feat',
  });
  const fm = loadFmWith(st);
  let out;
  assert.doesNotThrow(() => { out = fm.getActiveFeatures(); },
    'a junk active name must not crash the dashboard reader');
  const flagged = out.features.filter((f) => f.flagged === 'invalid-entry');
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].feature, 'x --scope module-1');
  assert.equal(flagged[0].state, 'invalid');
  const good = out.features.filter((f) => f.feature === 'good-feat');
  assert.equal(good.length, 1);
  assert.equal(good[0].state, 'plan');
  assert.equal(good[0].isPrimary, true);
});

// --- Scenario 9 (FR-07), real-path half: the status-core creation chokepoint ---
//
// Exercises the REAL lib/pdca/status -> status-core.js updatePdcaStatus row
// constructor (the single chokepoint covering the fire-time creator in
// lib/orchestrator/skill-invocation-effects.js:280 and lifecycle.js
// initializeFeature, neither of which passes ownerSession itself). Platform
// and config are mocked to a second temp project dir so the real state-store
// writes land in /tmp, never in the live .bkit/ tree.

const realTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br155-real-'));
const realProjDir = path.join(realTmpDir, 'project');
const realPluginRoot = path.join(realTmpDir, 'plugin');
fs.mkdirSync(realProjDir, { recursive: true });
fs.mkdirSync(path.join(realPluginRoot, '.claude-plugin'), { recursive: true });

let realStatusCtx = null;
function loadRealStatus() {
  if (realStatusCtx) return realStatusCtx.status;
  const platformPath = require.resolve('../../lib/core/platform');
  const configPath = require.resolve('../../lib/core/config');
  const pathsPath = require.resolve('../../lib/core/paths');
  const stateStorePath = require.resolve('../../lib/core/state-store');
  const debugPath = require.resolve('../../lib/core/debug');
  const statusEntryPath = require.resolve('../../lib/pdca/status');
  const statusCorePath = require.resolve('../../lib/pdca/status-core');
  const statusCleanupPath = require.resolve('../../lib/pdca/status-cleanup');
  const statusDerivePath = require.resolve('../../lib/pdca/status-derive');

  const savedCore = require.cache[corePath]; // the fake core from the sections above
  const saved = [platformPath, configPath, pathsPath, stateStorePath, debugPath,
    statusEntryPath, statusCorePath, statusCleanupPath, statusDerivePath]
    .map((p) => [p, require.cache[p]]);

  require.cache[platformPath] = {
    id: platformPath, filename: platformPath, loaded: true,
    exports: { PROJECT_DIR: realProjDir, PLUGIN_ROOT: realPluginRoot },
  };
  require.cache[configPath] = {
    id: configPath, filename: configPath, loaded: true,
    exports: { getConfig: (key, defaultVal) => defaultVal },
  };
  [pathsPath, stateStorePath, debugPath, statusEntryPath, statusCorePath,
    statusCleanupPath, statusDerivePath, corePath].forEach((p) => delete require.cache[p]);

  const status = require('../../lib/pdca/status');
  realStatusCtx = {
    status,
    restore: () => {
      saved.forEach(([p, entry]) => {
        if (entry) require.cache[p] = entry;
        else delete require.cache[p];
      });
      if (savedCore) require.cache[corePath] = savedCore;
      else delete require.cache[corePath];
    },
  };
  return status;
}

test.after(() => {
  if (realStatusCtx) realStatusCtx.restore();
  fs.rmSync(realTmpDir, { recursive: true, force: true });
});

test('S9.3 (real path): updatePdcaStatus creating a missing row stamps ownerSession', () => {
  const status = loadRealStatus();
  const res = withSessionEnv('sess-real-create', () =>
    status.updatePdcaStatus('real-path-feat', 'pm', {}, { requireDocs: false }));
  assert.ok(res, 'write must succeed');
  const row = status.getPdcaStatusFull(true).features['real-path-feat'];
  assert.ok(row, 'row created by the real creation path');
  assert.equal(row.ownerSession, 'sess-real-create');
  assert.equal(typeof row.ownerSince, 'string');
  assert.ok(!Number.isNaN(Date.parse(row.ownerSince)));
  assert.equal(row.phase, 'pm');
});

test('S9.4 (real path): env absent → created row omits ownerSession, write still succeeds', () => {
  const status = loadRealStatus();
  const res = withSessionEnv(undefined, () =>
    status.updatePdcaStatus('real-path-noenv', 'pm', {}, { requireDocs: false }));
  assert.ok(res, 'absent env var must not fail the write');
  const row = status.getPdcaStatusFull(true).features['real-path-noenv'];
  assert.ok(row, 'row created');
  assert.equal('ownerSession' in row, false, 'no ownership stamp without a session id');
});

test('S9.5 (real path): chokepoint stamp is CREATION-ONLY — updates never re-stamp', () => {
  const status = loadRealStatus();
  withSessionEnv('sess-owner-a', () =>
    status.updatePdcaStatus('real-lease-feat', 'pm', {}, { requireDocs: false }));
  // A DIFFERENT session updates the existing row — ownership must not flip
  // (update-time re-stamping here would re-open the FR-08 phantom adoption).
  withSessionEnv('sess-owner-b', () =>
    status.updatePdcaStatus('real-lease-feat', 'plan', {}, { requireDocs: false }));
  const row = status.getPdcaStatusFull(true).features['real-lease-feat'];
  assert.equal(row.phase, 'plan', 'phase write applied');
  assert.equal(row.ownerSession, 'sess-owner-a', 'ownerSession unchanged by a foreign update');
});
