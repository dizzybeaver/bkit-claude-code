'use strict';
/**
 * Regression test: each PDCA state value has one writer, and a Stop only
 * transitions on a measured verdict.
 * 20 TC | console.assert based | no external dependencies
 *
 * - unified-stop fires no transition for pm/plan/design/do/report: a Stop ends
 *   a turn, not a phase. Firing them wrote history and checkpoints without
 *   moving the phase, and REPORT_DONE dropped the feature from tracking.
 * - gap-detector's report is recorded at SubagentStop into status.matchRate,
 *   from a strict parse or not at all. Metric M1 mirrors status.matchRate, so
 *   a rate written by hand reaches the gate too.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');

let passed = 0, failed = 0, total = 0, skipped = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

console.log('\n=== pdca-state-single-writer.test.js ===\n');

/** A temp project with plan+design docs and feature `demo` seeded at `phase`. */
function makeProject(phase, data = {}) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-sw-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-sw-home-'));
  fs.copyFileSync(path.join(REPO, 'bkit.config.json'), path.join(proj, 'bkit.config.json'));
  for (const [dir, name] of [['docs/01-plan/features', 'demo.plan.md'], ['docs/02-design/features', 'demo.design.md']]) {
    fs.mkdirSync(path.join(proj, dir), { recursive: true });
    fs.writeFileSync(path.join(proj, dir, name), '# doc\n');
  }
  const env = { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: proj, CLAUDE_PLUGIN_ROOT: REPO, BKIT_DEBUG: '' };
  const seed = [
    `const s = require(${JSON.stringify(path.join(REPO, 'lib/pdca/status'))});`,
    's.initPdcaStatusIfNotExists();',
    `s.updatePdcaStatus('demo', ${JSON.stringify(phase)}, ${JSON.stringify(data)});`,
    "s.addActiveFeature('demo', true);",
  ].join('');
  spawnSync('node', ['-e', seed], { cwd: proj, env, encoding: 'utf8' });
  return {
    proj, env,
    run(script, payload) {
      return spawnSync('node', [path.join(REPO, 'scripts', script)], {
        input: JSON.stringify(payload), cwd: proj, env, encoding: 'utf8', timeout: 20000,
      });
    },
    status() { return JSON.parse(fs.readFileSync(path.join(proj, '.bkit/state/pdca-status.json'), 'utf8')); },
    transitions() {
      return (this.status().history || []).filter((h) => h.feature === 'demo' && h.action === 'state_transition');
    },
    checkpoints() {
      const index = path.join(proj, '.bkit/checkpoints/index.json');
      return fs.existsSync(index) ? JSON.parse(fs.readFileSync(index, 'utf8')).length : 0;
    },
    m1(feature = 'demo') {
      const p = path.join(proj, '.bkit/state/quality-metrics.json');
      if (!fs.existsSync(p)) return undefined;
      const m = JSON.parse(fs.readFileSync(p, 'utf8'))[feature]?.metrics?.M1;
      return m && typeof m === 'object' ? m.value : m;
    },
    cleanup() {
      fs.rmSync(proj, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

const STOP = { hook_event_name: 'Stop', stop_hook_active: false };

// --- unified-stop: no transition without a measurement ---------------------

{
  const p = makeProject('plan');
  p.run('unified-stop.js', STOP);
  p.run('unified-stop.js', STOP);
  const s = p.status();
  assert('SW-001', s.features.demo.phase === 'plan', 'plan phase is unchanged after two Stops');
  assert('SW-002', p.transitions().length === 0, `no transition is written to history (got ${p.transitions().length})`);
  assert('SW-003', p.checkpoints() === 0, `no checkpoint is created (got ${p.checkpoints()})`);
  p.cleanup();
}

{
  const p = makeProject('report');
  p.run('unified-stop.js', STOP);
  const s = p.status();
  assert('SW-004', s.activeFeatures.includes('demo') && s.primaryFeature === 'demo',
    'a Stop in report keeps the feature tracked (archiving is /pdca archive)');
  p.cleanup();
}

{
  const p = makeProject('act', { qaRetryPending: true });
  p.run('unified-stop.js', STOP);
  const t = p.transitions();
  assert('SW-005', p.status().features.demo.phase === 'qa', 'act with a pending QA retry moves to qa');
  assert('SW-006', t.length === 1 && t[0].from === 'act' && t[0].to === 'qa',
    `exactly one act->qa transition is recorded (got ${t.map((h) => `${h.from}->${h.to}`).join(',') || 'none'})`);
  assert('SW-007', p.checkpoints() === 1, `one checkpoint precedes the transition (got ${p.checkpoints()})`);
  p.cleanup();
}

// --- parseGapReport --------------------------------------------------------

const { parseGapReport } = require(path.join(REPO, 'lib/quality/match-rate'));
const report = (target, row) => `## Analysis Overview\n- Analysis Target: ${target}\n\n${row}\n`;
const BOLD_ROW = (r) => `| **Overall Match Rate** | **${r}%** | ok |`;

const ok = parseGapReport(report('demo', BOLD_ROW(92)));
assert('SW-008', ok && ok.feature === 'demo' && ok.matchRate === 92, 'reads feature and rate from the report format');
assert('SW-009', parseGapReport(report('demo', '| Overall Match Rate | 97.5% | ok |'))?.matchRate === 97.5,
  'accepts the row without bold markers');
assert('SW-010', parseGapReport('Overall Match Rate: 92%\n- Analysis Target: demo') === null,
  'a rate outside the Overall table row is unmeasured');
assert('SW-011', parseGapReport(report('demo', BOLD_ROW(92)) + BOLD_ROW(70)) === null,
  'two different Overall rows are ambiguous, not either value');
assert('SW-012', parseGapReport(report('demo', BOLD_ROW(120))) === null, 'a rate above 100 is rejected');

// --- SubagentStop records the judge's number -------------------------------

const gapStop = (target, rate, extra = {}) => ({
  hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'bkit:gap-detector',
  last_assistant_message: report(target, BOLD_ROW(rate)), ...extra,
});

{
  const p = makeProject('do');
  p.run('subagent-stop-handler.js', gapStop('demo', 92));
  const f = p.status().features.demo;
  assert('SW-013', f.phase === 'check' && f.matchRate === 92 && f.measured === true,
    `gap-detector report sets matchRate and moves do to check (got ${f.phase}/${f.matchRate})`);
  assert('SW-014', p.m1() === 92, `metric M1 is written from the same parse (got ${p.m1()})`);
  p.cleanup();
}

{
  const p = makeProject('act');
  p.run('subagent-stop-handler.js', gapStop('demo', 93));
  const f = p.status().features.demo;
  assert('SW-020', f.phase === 'check' && f.matchRate === 93,
    `re-measuring after an iteration moves act back to check (got ${f.phase}/${f.matchRate})`);
  p.cleanup();
}

{
  const p = makeProject('qa');
  p.run('subagent-stop-handler.js', gapStop('demo', 95));
  const f = p.status().features.demo;
  assert('SW-015', f.phase === 'qa' && f.matchRate === 95, 'a re-measurement in qa updates the rate without moving the phase back');
  p.cleanup();
}

{
  const p = makeProject('do');
  p.run('subagent-stop-handler.js', gapStop('other', 92));
  p.run('subagent-stop-handler.js', gapStop('demo', 92, { agent_type: 'code-analyzer' }));
  p.run('subagent-stop-handler.js', gapStop('demo', 92, { last_assistant_message: '- Analysis Target: demo\nMatch Rate: 92%' }));
  const f = p.status().features.demo;
  assert('SW-016', f.matchRate == null && p.m1() === undefined
    && !p.status().features.other && p.m1('other') === undefined,
    'an untracked feature, a non-judge agent, or an unreadable report records nothing');
  p.cleanup();
}

// --- analysis-stop no longer copies status into M1 -------------------------

{
  const p = makeProject('check', { matchRate: 92, measured: true });
  p.run('analysis-stop.js', { hook_event_name: 'Stop' });
  assert('SW-017', p.m1() === undefined, 'code-analyzer stop does not write M1');
  p.cleanup();
}

// --- M1 mirrors status.matchRate before the gate reads it -------------------

{
  const p = makeProject('do');
  p.run('subagent-stop-handler.js', gapStop('demo', 85));
  const seed = `require(${JSON.stringify(path.join(REPO, 'lib/pdca/status'))})`
    + ".updatePdcaStatus('demo', 'check', { matchRate: 92, measured: true });";
  spawnSync('node', ['-e', seed], { cwd: p.proj, env: p.env, encoding: 'utf8' });
  assert('SW-018', p.m1() === 85, `a hand-written rate has not reached M1 yet (got ${p.m1()})`);
  p.run('unified-stop.js', STOP);
  assert('SW-019', p.m1() === 92, `Stop mirrors the hand-written rate into M1 before the gate (got ${p.m1()})`);
  p.cleanup();
}

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
