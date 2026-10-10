'use strict';
/**
 * Unit Tests for lib/control/automation-controller.js
 * 25 TC | console.assert based | no external dependencies
 */

let mod;
try {
  mod = require('../../lib/control/automation-controller');
} catch (e) {
  console.error('Module load failed:', e.message);
  process.exit(1);
}

let passed = 0, failed = 0, total = 0, skipped = 0;
const failures = [];

// br045: state-mutating probes run against a throwaway CLAUDE_PROJECT_DIR so the
// REAL .bkit/runtime/control-state.json is never touched (the AC-008
// setLevel('manual') write was a direct real-state poisoner).
// NOTE: the purge regex MUST cover the lib/core/index.js BARREL — getCore()
// memoizes require('../core'), and a barrel loaded before the sandbox pins a
// stale platform instance with the real PROJECT_DIR.
function purgeCache(re) {
  Object.keys(require.cache).forEach(k => { if (re.test(k)) delete require.cache[k]; });
}
const CTRL_PURGE = /lib\/(core\/|control\/automation-controller)/;
function withSandboxedController(fn) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const saved = process.env.CLAUDE_PROJECT_DIR;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-unit-sandbox-'));
  try {
    process.env.CLAUDE_PROJECT_DIR = tmp;
    purgeCache(CTRL_PURGE);
    const sandboxed = require('../../lib/control/automation-controller');
    fn(sandboxed);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
    purgeCache(CTRL_PURGE); // later suites re-require the REAL controller
  }
}

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

function skip(id, message) { total++; skipped++; console.log(`  SKIP: ${id} - ${message}`); }

console.log('\n=== automation-controller.test.js ===\n');

const {
  AUTOMATION_LEVELS, DEFAULT_LEVEL, LEVEL_DEFINITIONS, LEGACY_LEVEL_MAP,
  GATE_CONFIG, DESTRUCTIVE_OPS,
  getCurrentLevel, setLevel, getLevelName, levelFromName,
  canAutoAdvance, isDestructiveAllowed,
  emergencyStop, emergencyResume,
} = mod;

// --- AC-001~005: L0-L4 definitions and names ---

assert('AC-001', AUTOMATION_LEVELS.MANUAL === 0, 'AUTOMATION_LEVELS.MANUAL = 0');
assert('AC-002', AUTOMATION_LEVELS.GUIDED === 1, 'AUTOMATION_LEVELS.GUIDED = 1');
assert('AC-003', AUTOMATION_LEVELS.SEMI_AUTO === 2, 'AUTOMATION_LEVELS.SEMI_AUTO = 2');
assert('AC-004', AUTOMATION_LEVELS.AUTO === 3, 'AUTOMATION_LEVELS.AUTO = 3');
assert('AC-005', AUTOMATION_LEVELS.FULL_AUTO === 4, 'AUTOMATION_LEVELS.FULL_AUTO = 4');

// --- AC-006~010: getCurrentLevel/setLevel ---

{
  try {
    const level = getCurrentLevel();
    assert('AC-006', typeof level === 'number' && level >= 0 && level <= 4, `getCurrentLevel returns valid level (${level})`);
  } catch (e) {
    skip('AC-006', 'getCurrentLevel requires core module: ' + e.message);
  }
}

// AC-007~010: sandboxed (br045) — these setLevel calls wrote the REAL state file.
withSandboxedController((m) => {
  try {
    const result = m.setLevel(3, { reason: 'test' });
    assert('AC-007', result.success === true && result.newLevel === 3, 'setLevel(3) succeeds');
  } catch (e) {
    skip('AC-007', 'setLevel requires core module: ' + e.message);
  }

  try {
    const result = m.setLevel('manual', { reason: 'test' });
    assert('AC-008', result.success === true && result.newLevel === 0, 'setLevel("manual") resolves to 0');
  } catch (e) {
    skip('AC-008', 'setLevel requires core module: ' + e.message);
  }

  try {
    const result = m.setLevel(99);
    assert('AC-009', result.success === false, 'setLevel(99) fails for invalid level');
  } catch (e) {
    skip('AC-009', 'setLevel requires core module: ' + e.message);
  }

  try {
    const result = m.setLevel(-1);
    assert('AC-010', result.success === false, 'setLevel(-1) fails for negative level');
  } catch (e) {
    skip('AC-010', 'setLevel requires core module: ' + e.message);
  }
});

// --- AC-011~015: canAutoAdvance per phase/level combo ---

assert('AC-011', canAutoAdvance('idle', 'pm', 1) === true, 'idle->pm auto-advances at L1 (autoApproveLevel=1)');
assert('AC-012', canAutoAdvance('idle', 'pm', 0) === false, 'idle->pm does NOT auto-advance at L0');
assert('AC-013', canAutoAdvance('pm', 'plan', 2) === true, 'pm->plan auto-advances at L2');
assert('AC-014', canAutoAdvance('pm', 'plan', 1) === false, 'pm->plan does NOT auto-advance at L1');
assert('AC-015', canAutoAdvance('do', 'check', 3) === true, 'do->check auto-advances at L3');

// --- AC-016~020: isDestructiveAllowed per operation/level ---

assert('AC-016', isDestructiveAllowed('file_delete', 4) === 'allow', 'file_delete allowed at L4');
assert('AC-017', isDestructiveAllowed('file_delete', 2) === 'ask', 'file_delete ask at L2 (below autoLevel=4, above denyBelow=0)');
assert('AC-018', isDestructiveAllowed('bash_destructive', 2) === 'deny', 'bash_destructive deny at L2 (below denyBelow=3)');
assert('AC-019', isDestructiveAllowed('git_push_force', 3) === 'deny', 'git_push_force deny at L3 (denyBelow=4)');
assert('AC-020', isDestructiveAllowed('git_push', 3) === 'allow', 'git_push allow at L3 (autoLevel=3)');

// --- AC-021~025: emergencyStop/emergencyResume ---

// AC-021~024: sandboxed (br045) — setLevel + emergencyStop/Resume mutate state.
withSandboxedController((m) => {
  try {
    // First set a known level
    m.setLevel(3, { reason: 'pre-emergency' });
    const stopResult = m.emergencyStop('test emergency');
    assert('AC-021', typeof stopResult.previousLevel === 'number', 'emergencyStop returns previousLevel');
    assert('AC-022', typeof stopResult.fallbackLevel === 'number' && stopResult.fallbackLevel <= stopResult.previousLevel, 'emergencyStop drops to fallbackLevel');

    const resumeResult = m.emergencyResume();
    assert('AC-023', resumeResult.success === true, 'emergencyResume succeeds after stop');

    // Double resume should fail
    const doubleResume = m.emergencyResume();
    assert('AC-024', doubleResume.success === false, 'emergencyResume fails when not in emergency');
  } catch (e) {
    skip('AC-021', 'emergencyStop requires core module: ' + e.message);
    skip('AC-022', 'emergencyStop requires core module: ' + e.message);
    skip('AC-023', 'emergencyResume requires core module: ' + e.message);
    skip('AC-024', 'emergencyResume requires core module: ' + e.message);
  }
});

// Static checks
assert('AC-025', typeof LEVEL_DEFINITIONS === 'object' && Object.keys(LEVEL_DEFINITIONS).length === 5, 'LEVEL_DEFINITIONS has 5 entries (L0-L4)');

// Bonus structural assertions
assert('AC-026', getLevelName(0) === 'manual', 'getLevelName(0) = manual');
assert('AC-027', getLevelName(4) === 'full-auto', 'getLevelName(4) = full-auto');
assert('AC-028', levelFromName('auto') === 3, 'levelFromName("auto") = 3');
assert('AC-029', levelFromName('nonexistent') === -1, 'levelFromName("nonexistent") = -1');

assert('AC-030', typeof GATE_CONFIG === 'object' && Object.keys(GATE_CONFIG).length >= 10, 'GATE_CONFIG has 10+ entries');
assert('AC-031', typeof DESTRUCTIVE_OPS === 'object' && Object.keys(DESTRUCTIVE_OPS).length >= 7, 'DESTRUCTIVE_OPS has 7+ entries');
assert('AC-032', DEFAULT_LEVEL === 2, 'DEFAULT_LEVEL is 2 (SEMI_AUTO)');
assert('AC-033', LEGACY_LEVEL_MAP['guide'] === 1 && LEGACY_LEVEL_MAP['semi-auto'] === 2, 'LEGACY_LEVEL_MAP maps correctly');

// --- Summary ---

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
