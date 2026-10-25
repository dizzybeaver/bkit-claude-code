#!/usr/bin/env node
'use strict';
/**
 * Unit Tests — metric recording for dispatched analyzers (br159 module-1)
 *
 * FR-01: a completed gap-detector whose report contains a match rate AND a
 *   resolvable feature must persist matchRate. The hook parser itself never
 *   runs for Agent-tool dispatches (harness-side wiring gap: SubagentStop
 *   handler does not dispatch; unified-stop's detectActiveAgent has no live
 *   agent_name source on the main Stop), so the sanctioned recording entry
 *   recordAnalysisMetrics(feature, metrics, source) is the fix surface.
 * FR-02: same for code-analyzer metrics (M2/M3/M4/M7) — the gate reads
 *   qualityScore/apiCompliance via toGateFormat; the entry records measured
 *   values only, and analysis-stop no longer fabricates 75/0/80 baselines.
 *
 * Isolation: CLAUDE_PROJECT_DIR=TMP_ROOT before any lib/ require (lib/core/
 * platform captures the env at first import), so writes land in a throwaway
 * tmp root — never the repo's real .bkit.
 *
 * Design Ref: §2 module-1 (docs/02-design/features/br159-metric-recording-followups)
 *
 * @module test/unit/metrics-recording-br159
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-metrics-br159-'));
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.on('exit', () => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const { assert, skip, summary } = require('../helpers/assert');

// eslint-disable-next-line no-console -- test output convention
console.log('\n=== metrics-recording-br159.test.js ===\n');

let mc, gapHook, STATE_PATHS, migration;
try {
  mc = require('../../lib/quality/metrics-collector');
  gapHook = require('../../scripts/gap-detector-stop'); // bare-require guard: pure helpers
  STATE_PATHS = require('../../lib/core/paths').STATE_PATHS;
  migration = require('../../lib/pdca/status-migration');
} catch {
  mc = null;
}
const moduleLoaded = mc !== null;

function seedStatus(features, primaryFeature) {
  const statusPath = STATE_PATHS.pdcaStatus();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  const status = migration.createInitialStatusV2();
  status.features = features;
  status.activeFeatures = Object.keys(features);
  status.primaryFeature = primaryFeature || status.activeFeatures[0] || null;
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  // status-core keeps a 3s read cache — force-refresh so the next reader in
  // this process sees the re-seeded registry, not the previous TC's.
  const { getPdcaStatusFull } = require('../../lib/pdca/status');
  getPdcaStatusFull(true);
  return status;
}

function readJson(file) {
  const p = path.join(STATE_PATHS.state(), file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function featEntry(name) {
  const status = readJson0();
  return status ? status.features[name] : undefined;
}

function readJson0() {
  const p = STATE_PATHS.pdcaStatus();
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const iso = () => new Date().toISOString();

// ============================================================
// TC-01 (FR-01): completed gap-detector payload → matchRate persists
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'feat-gap': {
        phase: 'check', phaseNumber: 4, matchRate: null, measured: false,
        iterationCount: 1, requirements: [], documents: {},
        timestamps: { started: iso(), lastUpdated: iso() },
      },
    });
    // Synthetic completed-agent report — the exact live-verified string shape.
    const reportText = '## Gap Analysis: feat-gap\nFeature: feat-gap\n\nOverall Match Rate: 95.8%\n';
    const matchRate = gapHook.parseMatchRate(reportText);
    const feature = gapHook.extractFeatureFromText(reportText);
    const result = mc.recordAnalysisMetrics(
      feature, { matchRate }, 'gap-detector agent report (br159 fixture TC-01)');

    const entry = featEntry('feat-gap');
    const qm = readJson('quality-metrics.json');
    const ga = readJson('gap-analysis.json');

    assert('TC-01a',
      matchRate === 95 && feature === 'feat-gap',
      'report text parses to matchRate 95 / feature feat-gap');
    assert('TC-01b',
      result.success === true && result.matchRate === 95,
      'recordAnalysisMetrics succeeds for a registry-known feature');
    assert('TC-01c',
      entry && entry.matchRate === 95,
      `registry matchRate persisted (got ${entry && entry.matchRate})`);
    assert('TC-01d',
      qm && qm['feat-gap'] && qm['feat-gap'].metrics.M1.value === 95,
      'M1 metric series recorded from the agent report');
    assert('TC-01e',
      ga && !!ga.analyzedAt && ga.byFeature['feat-gap'].matchRate === 95,
      'gap-analysis store carries analyzedAt + per-feature matchRate (MCP bkit_gap_analysis source)');
  } else {
    skip('TC-01', 'Module not loaded');
  }
}

// ============================================================
// TC-02 (FR-02): code-analyzer payload → gate metrics recorded
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'feat-code': {
        phase: 'check', phaseNumber: 4, matchRate: null, measured: false,
        iterationCount: 0, requirements: [], documents: {},
        timestamps: { started: iso(), lastUpdated: iso() },
      },
    });
    const reportText = 'codeQualityScore: 87\nCritical issues: 2\nAPI compliance: 96%';
    // Same patterns the code-analyzer writer uses (scripts/analysis-stop.js).
    const q = reportText.match(/(Quality|quality)\s*(Score|score)[^0-9]*(\d+)/);
    const c = reportText.match(/(Critical|critical)[^0-9]*(\d+)/);
    const a = reportText.match(/(API|api)\s*compliance[^0-9]*(\d+)/i);
    const result = mc.recordAnalysisMetrics('feat-code', {
      codeQualityScore: parseInt(q[3], 10),
      criticalIssueCount: parseInt(c[2], 10),
      apiComplianceRate: parseInt(a[2], 10),
    }, 'code-analyzer agent report (br159 fixture TC-02)');

    const gate = mc.toGateFormat('feat-code');

    assert('TC-02a',
      result.success === true && result.recorded.join(',') === 'M2,M3,M4',
      'code-analyzer values recorded as M2/M3/M4');
    assert('TC-02b',
      gate && gate.codeQualityScore === 87 && gate.criticalIssueCount === 2
        && gate.apiComplianceRate === 96,
      `gate reads qualityScore 87 / critical 2 / apiCompliance 96 (got ${JSON.stringify(gate)})`);
  } else {
    skip('TC-02', 'Module not loaded');
  }
}

// ============================================================
// TC-03 (regression guard): working-shape behavior unchanged
// ============================================================
{
  if (moduleLoaded) {
    assert('TC-03a',
      gapHook.parseMatchRate('Overall Match Rate: 95.8%') === 95
        && gapHook.parseMatchRate('no rate here') === null,
      'parseMatchRate behavior unchanged (95.8% → 95, absent → null)');
    assert('TC-03b',
      gapHook.extractFeatureFromText("Feature: 'feat-gap'") === 'feat-gap',
      'extractFeatureFromText behavior unchanged');
    const status = readJson0();
    assert('TC-03c',
      gapHook.isKnownFeature('feat-code', status) === true
        && gapHook.isKnownFeature('ghost', status) === false,
      'isKnownFeature guard behavior unchanged');
    assert('TC-03d',
      typeof gapHook.recordAnalysisMetrics === 'function',
      'gap-detector-stop re-exports the sanctioned recording entry');
  } else {
    skip('TC-03', 'Module not loaded');
  }
}

// ============================================================
// TC-04: unknown feature refused — no misattributed metrics
// ============================================================
{
  if (moduleLoaded) {
    const result = mc.recordAnalysisMetrics('ghost', { matchRate: 90 }, 'fixture TC-04');
    const qm = readJson('quality-metrics.json');
    assert('TC-04',
      result.success === false && result.reason === 'E-UNKNOWN-FEATURE'
        && !(qm && qm.ghost),
      'unknown feature refused with E-UNKNOWN-FEATURE, nothing recorded');
  } else {
    skip('TC-04', 'Module not loaded');
  }
}

// ============================================================
// TC-05: argument validation — explicit refusals, no silent swallows
// ============================================================
{
  if (moduleLoaded) {
    const bad = mc.recordAnalysisMetrics('', { matchRate: 1 }, 's');
    const unknown = mc.recordAnalysisMetrics('feat-code', { velocity: 3 }, 's');
    const invalid = mc.recordAnalysisMetrics('feat-code', { matchRate: NaN }, 's');
    const empty = mc.recordAnalysisMetrics('feat-code', {}, 's');
    assert('TC-05',
      bad.reason === 'E-BAD-ARGS' && unknown.reason === 'E-UNKNOWN-METRIC'
        && invalid.reason === 'E-INVALID-METRICS' && empty.reason === 'E-NO-METRICS',
      'bad args / unknown key / non-finite value / empty set each refused explicitly');
  } else {
    skip('TC-05', 'Module not loaded');
  }
}

// ============================================================
// TC-06: analysis-stop (code-analyzer writer) no longer fabricates
// M2=75 / M3=0 / M7=80 baselines on a reportless payload — while the
// working shape (M1 from registry matchRate) still records.
// Pre-fix this is RED: M2 lands at the 75 baseline no analyzer reported.
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'feat-child': {
        phase: 'check', phaseNumber: 4, matchRate: 95, measured: true,
        iterationCount: 0, requirements: [], documents: {},
        timestamps: { started: iso(), lastUpdated: iso() },
      },
    });
    const { spawnSync } = require('child_process');
    const repoRoot = path.resolve(__dirname, '..', '..');
    const proc = spawnSync(process.execPath,
      [path.join(repoRoot, 'scripts', 'analysis-stop.js')],
      { input: JSON.stringify({ session_id: 'br159-probe' }), env: process.env, timeout: 15000 });

    const qm = readJson('quality-metrics.json');
    const m = qm && qm['feat-child'] ? qm['feat-child'].metrics : {};

    assert('TC-06a',
      proc.status === 0,
      'analysis-stop runs cleanly on a synthetic payload');
    assert('TC-06b',
      m.M1 && m.M1.value === 95,
      'working shape unchanged: M1 still recorded from registry matchRate');
    assert('TC-06c',
      m.M2 === undefined && m.M3 === undefined && m.M7 === undefined,
      `no fabricated M2/M3/M7 baselines on a reportless payload (got ${JSON.stringify({ M2: m.M2, M3: m.M3, M7: m.M7 })})`);
  } else {
    skip('TC-06', 'Module not loaded');
  }
}

summary();
