#!/usr/bin/env node
'use strict';
/**
 * Unit Tests — SubagentStop analyzer dispatch bridge (br162, design §8)
 *
 * (1) gap-detector-typed payload + "Overall Match Rate: 95.8%" report →
 *     registry matchRate recorded + gap-analysis store written
 * (2) code-analyzer-typed payload + codeQualityScore 87 / criticalIssueCount 0
 *     / API compliance 100 → M2/M3/M4 recorded (gate-readable)
 * (3) NON-analyzer payload → handler output golden-identical, zero records
 * (4) analyzer-typed + unreadable transcript → no crash, no record
 * (5) unresolved feature → no record (deny-biased)
 *
 * Isolation: CLAUDE_PROJECT_DIR=TMP_ROOT before any lib/ require; fixture
 * transcripts live in the sandbox; handler child runs inherit the env.
 *
 * Design Ref: §2 / §8 (docs/02-design/features/br162-subagentstop-analysis-dispatch)
 *
 * @module test/unit/subagent-dispatch-br162
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br162-'));
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.on('exit', () => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const { assert, skip, summary } = require('../helpers/assert');

// eslint-disable-next-line no-console -- test output convention
console.log('\n=== subagent-dispatch-br162.test.js ===\n');

let handler, STATE_PATHS, migration, mc;
try {
  handler = require('../../scripts/subagent-stop-handler'); // bare-require guard exports the bridge
  STATE_PATHS = require('../../lib/core/paths').STATE_PATHS;
  migration = require('../../lib/pdca/status-migration');
  mc = require('../../lib/quality/metrics-collector');
} catch {
  handler = null;
}
const moduleLoaded = handler !== null;

const iso = () => new Date().toISOString();
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function seedStatus(features, primaryFeature) {
  const statusPath = STATE_PATHS.pdcaStatus();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  const status = migration.createInitialStatusV2();
  status.features = features;
  status.activeFeatures = primaryFeature ? [primaryFeature] : [];
  status.primaryFeature = primaryFeature || null;
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  // status-core keeps a 3s read cache — force-refresh for the next reader.
  const { getPdcaStatusFull } = require('../../lib/pdca/status');
  getPdcaStatusFull(true);
  return status;
}

function readJson(file) {
  const p = path.join(STATE_PATHS.state(), file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function fixtureTranscript(reportText) {
  const file = path.join(TMP_ROOT, `fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'analyze' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'reading design docs…' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: reportText }] } }),
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function runHandlerChild(payload) {
  const { spawnSync } = require('child_process');
  return spawnSync(process.execPath,
    [path.join(REPO_ROOT, 'scripts', 'subagent-stop-handler.js')],
    { input: JSON.stringify(payload), env: process.env, timeout: 15000 });
}

function gapFixture() {
  return seedStatus({
    'feat-gap': {
      phase: 'check', phaseNumber: 4, matchRate: null, measured: false,
      iterationCount: 1, requirements: [], documents: {},
      timestamps: { started: iso(), lastUpdated: iso() },
    },
  }, 'feat-gap');
}

// ============================================================
// (1) gap-detector payload + 95.8% report → matchRate recorded
// ============================================================
{
  if (moduleLoaded) {
    gapFixture();
    const reportText = '## Gap Analysis: feat-gap\nFeature: feat-gap\n\nOverall Match Rate: 95.8%';
    const transcript = fixtureTranscript(reportText);
    // Live-observed agent_type form (.bkit/runtime/hook-dispatch.ndjson, 2026-10-25)
    const payload = {
      hook_event_name: 'SubagentStop', agent_type: 'bkit:gap-detector',
      agent_id: 'gd1', session_id: 's1', transcript_path: transcript,
    };

    // Direct bridge call: precise verdict
    const direct = handler.dispatchAnalyzerMetrics(payload, payload.agent_type);

    const status = readJson('status-fallback') || null;
    const statusPath = STATE_PATHS.pdcaStatus();
    const registry = fs.existsSync(statusPath)
      ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : null;
    const qm = readJson('quality-metrics.json');
    const ga = readJson('gap-analysis.json');

    assert('TC1-a',
      direct.dispatched === true && direct.recorded === true,
      `bridge dispatches and records (got ${JSON.stringify(direct)})`);
    assert('TC1-b',
      registry && registry.features['feat-gap'].matchRate === 95,
      `registry matchRate recorded (got ${registry && registry.features['feat-gap'].matchRate})`);
    assert('TC1-c',
      qm && qm['feat-gap'] && qm['feat-gap'].metrics.M1.value === 95,
      'M1 metric series recorded');
    assert('TC1-d',
      ga && !!ga.analyzedAt && ga.byFeature['feat-gap'].matchRate === 95,
      'gap-analysis store written (analyzedAt + per-feature matchRate)');

    // End-to-end: full handler child process records too (fresh registry seed)
    gapFixture();
    const proc = runHandlerChild(payload);
    const registry2 = JSON.parse(fs.readFileSync(STATE_PATHS.pdcaStatus(), 'utf8'));
    assert('TC1-e',
      proc.status === 0 && registry2.features['feat-gap'].matchRate === 95,
      'full SubagentStop handler run records matchRate end-to-end');
  } else {
    skip('TC1', 'Module not loaded');
  }
}

// ============================================================
// (2) code-analyzer payload + 87/0/100 → metrics recorded
// ============================================================
{
  if (moduleLoaded) {
    seedStatus({
      'feat-code': {
        phase: 'check', phaseNumber: 4, matchRate: null, measured: false,
        iterationCount: 0, requirements: [], documents: {},
        timestamps: { started: iso(), lastUpdated: iso() },
      },
    }, 'feat-code');
    const reportText = 'Feature: feat-code\ncodeQualityScore: 87\ncriticalIssueCount: 0\nAPI compliance: 100';
    const transcript = fixtureTranscript(reportText);
    const payload = {
      hook_event_name: 'SubagentStop', agent_type: 'code-analyzer',
      agent_id: 'ca1', session_id: 's2', transcript_path: transcript,
    };

    const direct = handler.dispatchAnalyzerMetrics(payload, payload.agent_type);
    const gate = mc.toGateFormat('feat-code');

    assert('TC2-a',
      direct.dispatched === true && direct.recorded === true,
      `bridge records code-analyzer metrics (got ${JSON.stringify(direct)})`);
    assert('TC2-b',
      gate && gate.codeQualityScore === 87 && gate.criticalIssueCount === 0
        && gate.apiComplianceRate === 100,
      `gate reads qualityScore 87 / critical 0 / apiCompliance 100 (got ${JSON.stringify(gate)})`);

    // End-to-end child run on a freshly seeded registry
    seedStatus({
      'feat-code': {
        phase: 'check', phaseNumber: 4, matchRate: null, measured: false,
        iterationCount: 0, requirements: [], documents: {},
        timestamps: { started: iso(), lastUpdated: iso() },
      },
    }, 'feat-code');
    const proc = runHandlerChild(payload);
    const gate2 = mc.toGateFormat('feat-code');
    assert('TC2-c',
      proc.status === 0 && gate2 && gate2.codeQualityScore === 87,
      'full handler run records codeQualityScore end-to-end');
  } else {
    skip('TC2', 'Module not loaded');
  }
}

// ============================================================
// (3) non-analyzer payload → golden output, zero records
// ============================================================
{
  if (moduleLoaded) {
    // Golden captured from the PRE-change handler (2026-10-25, clean sandbox):
    // team bookkeeping only, no next-action hint with no PDCA status.
    const GOLDEN = '{"systemMessage":"Subagent general-purpose stopped (completed)",'
      + '"hookSpecificOutput":{"hookEventName":"SubagentStop","agentId":"g1",'
      + '"agentName":"general-purpose","agentType":"general-purpose",'
      + '"status":"completed"}}';
    seedStatus({}, null); // empty registry — nothing attributable
    const payload = {
      hook_event_name: 'SubagentStop', agent_type: 'general-purpose',
      agent_id: 'g1', session_id: 's3', transcript_path: '/nonexistent/t.jsonl',
    };
    // Delta-based: TC1/TC2 already wrote state files in this sandbox — the
    // non-analyzer run must leave BOTH byte-identical.
    const qmBefore = JSON.stringify(readJson('quality-metrics.json'));
    const gaBefore = JSON.stringify(readJson('gap-analysis.json'));
    const direct = handler.dispatchAnalyzerMetrics(payload, payload.agent_type);
    const proc = runHandlerChild(payload);

    assert('TC3-a',
      direct.dispatched === false,
      'gate returns before any I/O for non-analyzer types');
    assert('TC3-b',
      proc.status === 0 && proc.stdout.toString().trim() === GOLDEN,
      `handler output golden-identical (got ${proc.status === 0 ? proc.stdout.toString().trim() : 'exit ' + proc.status})`);
    assert('TC3-c',
      JSON.stringify(readJson('quality-metrics.json')) === qmBefore
        && JSON.stringify(readJson('gap-analysis.json')) === gaBefore,
      'zero record attempts (quality-metrics.json and gap-analysis.json untouched)');
  } else {
    skip('TC3', 'Module not loaded');
  }
}

// ============================================================
// (4) analyzer-typed + unreadable transcript → no crash, no record
// ============================================================
{
  if (moduleLoaded) {
    gapFixture();
    const payload = {
      hook_event_name: 'SubagentStop', agent_type: 'bkit:gap-detector',
      agent_id: 'gd2', session_id: 's4',
      transcript_path: path.join(TMP_ROOT, 'does-not-exist.jsonl'),
    };
    const direct = handler.dispatchAnalyzerMetrics(payload, payload.agent_type);
    const proc = runHandlerChild(payload);
    const registry = JSON.parse(fs.readFileSync(STATE_PATHS.pdcaStatus(), 'utf8'));

    assert('TC4-a',
      direct.dispatched === true && direct.recorded === false,
      `unreadable transcript → silent skip (got ${JSON.stringify(direct)})`);
    assert('TC4-b',
      proc.status === 0,
      'handler does not crash on unreadable transcript');
    assert('TC4-c',
      registry.features['feat-gap'].matchRate === null,
      'no record written');
  } else {
    skip('TC4', 'Module not loaded');
  }
}

// ============================================================
// (5) unresolved feature → no record (deny-biased)
// ============================================================
{
  if (moduleLoaded) {
    // Registry holds a feature, but primaryFeature is null and the report
    // names no feature — nothing to attribute the measurement to.
    seedStatus({
      'other-feat': {
        phase: 'do', phaseNumber: 3, matchRate: null, measured: false,
        iterationCount: 0, requirements: [], documents: {},
        timestamps: { started: iso(), lastUpdated: iso() },
      },
    }, null);
    const transcript = fixtureTranscript('Overall Match Rate: 95.8%');
    const payload = {
      hook_event_name: 'SubagentStop', agent_type: 'bkit:gap-detector',
      agent_id: 'gd3', session_id: 's5', transcript_path: transcript,
    };
    const qmBefore = JSON.stringify(readJson('quality-metrics.json'));
    const direct = handler.dispatchAnalyzerMetrics(payload, payload.agent_type);
    const qm = readJson('quality-metrics.json');

    assert('TC5',
      direct.dispatched === true && direct.recorded === false
        && direct.reason === 'no-feature'
        && JSON.stringify(qm) === qmBefore
        && !(qm && qm['other-feat']),
      `unresolved feature → no record, reason no-feature (got ${JSON.stringify(direct)})`);
  } else {
    skip('TC5', 'Module not loaded');
  }
}

// ============================================================
// (6) gate accepts all four documented forms
// ============================================================
{
  if (moduleLoaded) {
    const t = handler.ANALYZER_TYPES;
    assert('TC6',
      t.has('bkit:gap-detector') && t.has('bkit:code-analyzer')
        && t.has('gap-detector') && t.has('code-analyzer')
        && !t.has('general-purpose') && !t.has('bkit:report-generator'),
      'type gate holds exactly the four analyzer forms');
  } else {
    skip('TC6', 'Module not loaded');
  }
}

summary();
