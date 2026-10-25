#!/usr/bin/env node
'use strict';
/**
 * Unit Tests — lib triad fixes (br159-metric-recording-followups, module-2)
 *
 * FR-03: registerFeature refuses a COMPLETED (non-archived) duplicate with
 *   E-DUP-REGISTER — the dup guard previously screened only active+archived,
 *   so a completed row half-registered and the first phase fire hit
 *   E-TERMINAL-WRITE (deferred confusion).
 * FR-04: updatePdcaStatus's requireDocs gate-skip path returns a defined
 *   result object ({success, feature, phase, note}) instead of undefined —
 *   callers stringifying the result (JSON.stringify(undefined).slice crash
 *   class) must never see undefined.
 * FR-05: enforceFeatureLimit disposes phase-less archivedTo-marker rows via
 *   isTerminalRow (third disposal site) — the inline
 *   'archived'||'completed' phase filter made them invisible to auto-cleanup.
 *
 * Isolation: CLAUDE_PROJECT_DIR=TMP_ROOT before any lib/ require (lib/core/
 * platform captures the env at first import), so writes land in a throwaway
 * tmp root — never the repo's real .bkit.
 *
 * Design Ref: §2 module-2 (docs/02-design/features/br159-metric-recording-followups)
 *
 * @module test/unit/lib-triad-br159
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-libtriad-br159-'));
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.on('exit', () => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const { assert, skip, summary, reset } = require('../helpers/assert');
reset();

// eslint-disable-next-line no-console -- test output convention
console.log('\n=== lib-triad-br159.test.js ===\n');

let featureManager, statusCore, cleanup, migration;
try {
  featureManager = require('../../lib/pdca/feature-manager');
  statusCore = require('../../lib/pdca/status-core');
  cleanup = require('../../lib/pdca/status-cleanup');
  migration = require('../../lib/pdca/status-migration');
} catch {
  featureManager = null;
}
const moduleLoaded = featureManager !== null;

function seedStatus(features, activeFeatures) {
  const { STATE_PATHS } = require('../../lib/core/paths');
  const statusPath = STATE_PATHS.pdcaStatus();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  const status = migration.createInitialStatusV2();
  status.features = features;
  status.activeFeatures = activeFeatures !== undefined
    ? activeFeatures
    : Object.keys(features);
  status.primaryFeature = status.activeFeatures[0] || null;
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

function readStatus() {
  const { STATE_PATHS } = require('../../lib/core/paths');
  return JSON.parse(fs.readFileSync(STATE_PATHS.pdcaStatus(), 'utf8'));
}

// ============================================================
// SC3 (FR-03): registerFeature vs a completed-phase duplicate →
// refused E-DUP-REGISTER (no half-registration)
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'done-feat': { phase: 'completed', phaseNumber: 8, matchRate: 95, iterationCount: 2, requirements: [], documents: {}, timestamps: { started: new Date().toISOString(), lastUpdated: new Date().toISOString() } },
    }, []); // completed row is NOT active — the exact screening gap
    const result = featureManager.registerFeature('done-feat');
    assert('SC3',
      result.registered === false && result.reason === 'E-DUP-REGISTER',
      'registerFeature on a completed (non-archived) row refused with E-DUP-REGISTER');
  } else {
    skip('SC3', 'Module not loaded');
  }
}

// ============================================================
// SC3b (FR-03 true test, mutation guard): an unknown name still
// registers — the widened terminal screen must not block fresh features
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({}, []);
    const result = featureManager.registerFeature('fresh-br159');
    assert('SC3b',
      result.registered === true && result.featureState !== null,
      'registerFeature on an unknown name still registers');
  } else {
    skip('SC3b', 'Module not loaded');
  }
}

// ============================================================
// SC4 (FR-04): requireDocs gate-skip path returns a defined object —
// the JSON.stringify(undefined).slice crash class
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'gated-feat': { phase: 'pm', phaseNumber: 0, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    // No plan/design docs on disk → shouldUpdate false → gate-skip path.
    const result = statusCore.updatePdcaStatus('gated-feat', 'plan');
    assert('SC4',
      result !== undefined &&
        typeof result === 'object' &&
        result.success === true &&
        result.feature === 'gated-feat' &&
        result.phase === 'plan' &&
        result.note === 'docs-gate-skipped',
      'updatePdcaStatus requireDocs-skip returns {success:true, feature, phase, note:"docs-gate-skipped"}');
  } else {
    skip('SC4', 'Module not loaded');
  }
}

// ============================================================
// SC5 (FR-05): enforceFeatureLimit clears a phase-less archivedTo-marker
// row beyond the limit (isTerminalRow, third disposal site)
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'live-br159': { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
      'marker-arch': { archivedTo: path.join(TMP_ROOT, 'docs', 'archive', '2026-10', 'marker-arch'), matchRate: 90, iterationCount: 1, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    const result = cleanup.enforceFeatureLimit(1);
    const after = readStatus();
    assert('SC5',
      result.success === true &&
        result.deletedCount === 1 &&
        result.deleted.includes('marker-arch') &&
        !after.features['marker-arch'] &&
        !!after.features['live-br159'],
      'enforceFeatureLimit deletes the phase-less archivedTo-marker row, spares the live row');
  } else {
    skip('SC5', 'Module not loaded');
  }
}

// eslint-disable-next-line no-console -- test output convention
console.log('');
const stats = summary();
process.exit(stats.failed > 0 ? 1 : 0);
