#!/usr/bin/env node
'use strict';
/**
 * Unit Tests — status-cleanup disposal fixes (br150/br152)
 * PDCA feature br150-152-registry-cleanup-fixes, FR-01 + FR-06 (module-1).
 *
 * FR-01: hasPlanOrDesignDoc separates a clean miss (no docs → false) from a
 *   lookup failure (conservative true). A name the path-safe validator rejects
 *   can never match a doc path, so a lookup throw for such a name is a clean
 *   miss and must NOT block the sanctioned orphan delete.
 * FR-06: disposal matches archived rows by phase; `archivedTo` is a fallback
 *   marker only when phase is absent, so archived-without-archivedTo rows are
 *   reachable by deleteFeatureFromStatus/cleanupArchivedFeatures.
 *
 * Isolation: CLAUDE_PROJECT_DIR=TMP_ROOT before any lib/ require (lib/core/
 * platform captures the env at first import), so writes land in a throwaway
 * tmp root — never the repo's real .bkit.
 *
 * Design Ref: docs/02-design/features/br150-152-registry-cleanup-fixes.design.md §6/§8.2
 *
 * @module test/unit/status-cleanup-br150
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-status-br150-'));
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.on('exit', () => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const { assert, skip, summary, reset } = require('../helpers/assert');
reset();

// eslint-disable-next-line no-console -- test output convention
console.log('\n=== status-cleanup-br150.test.js ===\n');

let cleanup, migration;
try {
  cleanup = require('../../lib/pdca/status-cleanup');
  migration = require('../../lib/pdca/status-migration');
} catch {
  cleanup = null;
  migration = null;
}
const moduleLoaded = cleanup !== null;

function seedStatus(features) {
  const { STATE_PATHS } = require('../../lib/core/paths');
  const statusPath = STATE_PATHS.pdcaStatus();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  const status = migration.createInitialStatusV2();
  status.features = features;
  for (const name of Object.keys(features)) {
    status.activeFeatures.push(name);
  }
  status.primaryFeature = Object.keys(features)[0] || null;
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

function createPlanDoc(feature) {
  const dir = path.join(TMP_ROOT, 'docs', '01-plan', 'features');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${feature}.plan.md`), `# Plan: ${feature}\n`);
}

// br150's registration artifact: a full sentence as feature name.
const SENTENCE_NAME =
  'studio-a7-blockfingerprints Please use work.md as workflow and please complete this until it is archived.';

// ============================================================
// SC1a (design §8.2 #1, FR-01): clean miss on a valid name → no docs → false
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'clean-miss-feat': { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    const result = cleanup.deleteFeatureFromStatus('clean-miss-feat');
    assert('SC1a',
      result.success === true && /orphan-removed/.test(result.reason || ''),
      'valid-name doc-less active is a clean miss → orphan-removed delete');
  } else {
    skip('SC1a', 'Module not loaded');
  }
}

// ============================================================
// SC1b (design §8.2 #1, FR-01): fs error on lookup → conservative true → refused
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'fserr-feat': { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    const paths = require('../../lib/core/paths');
    const origFindDoc = paths.findDoc;
    paths.findDoc = () => { throw new Error('EACCES: permission denied, stat plan.md'); };
    let result;
    try {
      result = cleanup.deleteFeatureFromStatus('fserr-feat');
    } finally {
      paths.findDoc = origFindDoc;
    }
    assert('SC1b',
      result.success === false && result.reason === 'Cannot delete active feature',
      'lookup fs error keeps conservative has-docs=true → delete refused');
  } else {
    skip('SC1b', 'Module not loaded');
  }
}

// ============================================================
// SC1c (FR-01 true test): invalid-name throw is a clean miss, NOT a lookup
// failure — orphan delete must succeed even when the lookup throws
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      [SENTENCE_NAME]: { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    const paths = require('../../lib/core/paths');
    const origFindDoc = paths.findDoc;
    paths.findDoc = () => { throw new Error('Invalid feature name: must match [A-Za-z0-9_-]+'); };
    let result;
    try {
      result = cleanup.deleteFeatureFromStatus(SENTENCE_NAME);
    } finally {
      paths.findDoc = origFindDoc;
    }
    assert('SC1c',
      result.success === true &&
        result.deletedFeature === SENTENCE_NAME &&
        /orphan-removed/.test(result.reason || ''),
      'sentence-artifact name with throwing lookup → orphan delete succeeds');
  } else {
    skip('SC1c', 'Module not loaded');
  }
}

// ============================================================
// SC2 (design §8.2 #2, FR-01): doc-less ACTIVE feature deletes via orphan path
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      [SENTENCE_NAME]: { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    const result = cleanup.deleteFeatureFromStatus(SENTENCE_NAME);
    assert('SC2',
      result.success === true &&
        result.deletedFeature === SENTENCE_NAME &&
        result.reason === 'orphan-removed (docs missing)',
      'doc-less sentence-artifact active deleted with orphan-removed reason');
  } else {
    skip('SC2', 'Module not loaded');
  }
}

// ============================================================
// SC2b (FR-01 guard): live feature WITH plan doc still refused
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'live-br150': { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    createPlanDoc('live-br150');
    const result = cleanup.deleteFeatureFromStatus('live-br150');
    assert('SC2b',
      result.success === false && result.reason === 'Cannot delete active feature',
      'live feature (plan doc on disk) still refused after FR-01');
  } else {
    skip('SC2b', 'Module not loaded');
  }
}

// ============================================================
// SC8a (design §8.2 #8, FR-06): archived WITHOUT archivedTo → delete succeeds
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'arch-no-to': { phase: 'archived', phaseNumber: 8, matchRate: 92, iterationCount: 1, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    const result = cleanup.deleteFeatureFromStatus('arch-no-to');
    assert('SC8a',
      result.success === true && result.deletedFeature === 'arch-no-to',
      'archived-without-archivedTo deleted by deleteFeatureFromStatus');
  } else {
    skip('SC8a', 'Module not loaded');
  }
}

// ============================================================
// SC8b (FR-06 true test): phase-less row with only archivedTo marker counts
// as terminal — deletable even with a plan doc on disk
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'parked-no-phase': { archivedTo: path.join(TMP_ROOT, 'docs', 'archive', '2026-10', 'parked-no-phase'), matchRate: 90, iterationCount: 1, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    createPlanDoc('parked-no-phase');
    const result = cleanup.deleteFeatureFromStatus('parked-no-phase');
    assert('SC8b',
      result.success === true && result.deletedFeature === 'parked-no-phase',
      'phase-less archivedTo row treated as terminal and deleted (docs on disk irrelevant)');
  } else {
    skip('SC8b', 'Module not loaded');
  }
}

// ============================================================
// SC8c (FR-06 true test): cleanupArchivedFeatures reaches archived-without-
// archivedTo (phase row) AND phase-less archivedTo row
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'phase-arch': { phase: 'archived', phaseNumber: 8, matchRate: 88, iterationCount: 1, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
      'marker-arch': { archivedTo: path.join(TMP_ROOT, 'docs', 'archive', '2026-10', 'marker-arch'), matchRate: 85, iterationCount: 1, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
      'still-live': { phase: 'do', phaseNumber: 3, matchRate: null, iterationCount: 0, requirements: [], documents: {}, timestamps: { started: new Date().toISOString() } },
    });
    createPlanDoc('still-live');
    const result = cleanup.cleanupArchivedFeatures(['phase-arch', 'marker-arch', 'still-live']);
    const { STATE_PATHS } = require('../../lib/core/paths');
    const status = JSON.parse(fs.readFileSync(STATE_PATHS.pdcaStatus(), 'utf8'));
    assert('SC8c',
      result.success === true &&
        result.deletedCount === 2 &&
        result.deleted.includes('phase-arch') &&
        result.deleted.includes('marker-arch') &&
        !result.deleted.includes('still-live') &&
        !status.features['phase-arch'] && !status.features['marker-arch'] &&
        !!status.features['still-live'],
      'cleanupArchivedFeatures deletes phase-archived (no archivedTo) and marker-only rows, spares live');
  } else {
    skip('SC8c', 'Module not loaded');
  }
}

// eslint-disable-next-line no-console -- test output convention
console.log('');
const stats = summary();
process.exit(stats.failed > 0 ? 1 : 0);
