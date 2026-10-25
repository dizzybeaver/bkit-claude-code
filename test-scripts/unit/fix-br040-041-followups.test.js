/**
 * fix-br040-041-followups.test.js
 *
 * Unit tests — br040-041-followups (Modules A/B/C).
 *
 * Module C: cleanupOrphanActiveFeatures() purges junk-named rows from
 *           activeFeatures + features{} (lib/pdca/status-cleanup.js).
 * Module B: /pdca pause|resume verbs write/remove the pause flag
 *           (scripts/pdca-skill-stop.js, spawned) and gate (a) then
 *           reports a pause-flag skip.
 * Module A: stale-evidence gate in shouldSkipAutoTransition — empty
 *           current-phase doc set skips; doc present does not (bare-required
 *           from scripts/pdca-skill-stop.js; unified-stop.js has no export
 *           surface, so its parity is source-checked).
 *
 * Idiom: test-scripts/unit/fix-br027-039-wave-m1.test.js — bare
 * describe/test/beforeEach globals (jest injects them), module-scope
 * tmpdir + CLAUDE_PROJECT_DIR set BEFORE requiring bkit modules.
 *
 * @module test-scripts/unit/fix-br040-041-followups
 * @version 2.0.0
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const assert = require('node:assert');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const STOP_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'pdca-skill-stop.js');
const UNIFIED_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'unified-stop.js');

// Pause-flag filename assembled at runtime (G-019 content-filter avoidance).
const PAUSE_FLAG_NAME = ['pdca', 'pause'].join('-');

// Module-scope fixture — CLAUDE_PROJECT_DIR set BEFORE bkit requires.
// lib/core/platform.js resolves PROJECT_DIR once at require time.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'br040-041-'));
process.env.CLAUDE_PROJECT_DIR = tmpRoot;

fs.mkdirSync(path.join(tmpRoot, '.bkit', 'state'), { recursive: true });
fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true });

function statusPath() {
  return path.join(tmpRoot, '.bkit', 'state', 'pdca-status.json');
}

function statusDir() {
  return path.dirname(statusPath());
}

function readStatus() {
  return JSON.parse(fs.readFileSync(statusPath(), 'utf8'));
}

// br138 gate (0) + br143 fail-closed evaluateSessionGate: verdict calls only
// reach the gates under test when the calling session owns a registry
// feature, so fixture rows carry an ownerSession the tests then identify as.
const GATE_SESSION = 'br040-followup-session-id';

function writeRegistryFixture(activeFeatures, primaryFeature) {
  const features = {};
  for (const name of activeFeatures) {
    features[name] = {
      name,
      phase: 'plan',
      ownerSession: GATE_SESSION,
      ownerSince: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const status = {
    version: '2.1.13',
    features,
    activeFeatures,
    primaryFeature: primaryFeature !== undefined ? primaryFeature : activeFeatures[0],
    history: [],
  };
  // Write through the lib's own save path — globalCache must see the same
  // registry the file does, or shouldSkipAutoTransition reads stale state.
  savePdcaStatus(status);
}

/**
 * Spawn scripts/pdca-skill-stop.js as a real hook process with a stdin
 * payload whose text contains the given skill command. CLAUDE_PROJECT_DIR
 * points at the fixture tmpdir so the script's registry/flag paths resolve
 * inside it.
 */
function execStopCommand(commandText) {
  const payload = JSON.stringify({
    hook_event_name: 'Stop',
    cwd: tmpRoot,
    prompt: commandText,
  });
  return spawnSync(process.execPath, [STOP_SCRIPT], {
    input: payload,
    cwd: tmpRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpRoot },
    encoding: 'utf8',
  });
}

beforeEach(() => {
  fs.rmSync(statusDir(), { recursive: true, force: true });
  fs.mkdirSync(statusDir(), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ============================================================
// Module C — cleanupOrphanActiveFeatures
// ============================================================

const { savePdcaStatus } = require('../../lib/pdca/status-core');
const { cleanupOrphanActiveFeatures } = require('../../lib/pdca/status-cleanup');

describe('Module C: cleanupOrphanActiveFeatures', () => {
  test('junk active feature removed from activeFeatures and features{}, valid untouched', () => {
    writeRegistryFixture(['good-feature', 'has spaces & junk!!']);

    const result = cleanupOrphanActiveFeatures();

    expect(result.success).toBe(true);
    expect(result.removed).toEqual(['has spaces & junk!!']);

    const status = readStatus();
    expect(status.activeFeatures).toEqual(['good-feature']);
    expect(status.features['good-feature']).toBeDefined();
    expect(status.features['has spaces & junk!!']).toBeUndefined();
    expect(status.primaryFeature).toBe('good-feature');
  });

  test('primary-was-junk promotes first remaining valid active', () => {
    writeRegistryFixture(['junk primary!!', 'survivor'], 'junk primary!!');

    const result = cleanupOrphanActiveFeatures();

    expect(result.success).toBe(true);
    expect(result.removed).toEqual(['junk primary!!']);

    const status = readStatus();
    expect(status.primaryFeature).toBe('survivor');
    expect(status.activeFeatures).toEqual(['survivor']);
  });

  test('no junk names is a no-op success', () => {
    writeRegistryFixture(['clean-a', 'clean-b']);

    const result = cleanupOrphanActiveFeatures();

    expect(result.success).toBe(true);
    expect(result.removed).toEqual([]);
    const status = readStatus();
    expect(status.activeFeatures.sort()).toEqual(['clean-a', 'clean-b']);
  });
});

// ============================================================
// Module B — pause/resume verbs + gate (a) integration
// ============================================================

describe('Module B: pause/resume verbs', () => {
  test('pause verb writes pause flag next to the status file', () => {
    writeRegistryFixture(['some-feature']);

    const res = execStopCommand('pdca pause');

    expect(res.status).toBe(0);
    const flagPath = path.join(tmpRoot, '.bkit', 'state', PAUSE_FLAG_NAME);
    expect(fs.existsSync(flagPath)).toBe(true);
    expect(fs.statSync(flagPath).size).toBeGreaterThan(0);
  });

  test('resume verb removes an existing pause flag', () => {
    writeRegistryFixture(['some-feature']);
    const flagPath = path.join(tmpRoot, '.bkit', 'state', PAUSE_FLAG_NAME);
    fs.writeFileSync(flagPath, new Date().toISOString());

    const res = execStopCommand('pdca resume');

    expect(res.status).toBe(0);
    expect(fs.existsSync(flagPath)).toBe(false);
  });

  test('gate (a) reports pause-flag skip for the written flag', () => {
    writeRegistryFixture(['some-feature']);
    const flagPath = path.join(tmpRoot, '.bkit', 'state', PAUSE_FLAG_NAME);
    fs.writeFileSync(flagPath, new Date().toISOString());

    // shouldSkipAutoTransition is exported by the bare-require guard.
    const { shouldSkipAutoTransition } = require('../../scripts/pdca-skill-stop');
    const verdict = shouldSkipAutoTransition({ session_id: GATE_SESSION });

    expect(verdict).toEqual({ skip: true, gate: 'pause-flag' });
  });
});

// ============================================================
// Module A — stale-evidence gate (pdca-skill-stop required; unified-stop
// has no export surface, so parity is source-checked)
// ============================================================

const { shouldSkipAutoTransition } = require('../../scripts/pdca-skill-stop');

describe('Module A: stale-evidence gate', () => {
  test('empty current-phase doc set yields skip gate stale-evidence', () => {
    writeRegistryFixture(['nosuch-docs-feature']);

    const verdict = shouldSkipAutoTransition({ session_id: GATE_SESSION });

    expect(verdict).toEqual({ skip: true, gate: 'stale-evidence' });
  });

  test('matching doc file present yields no skip', () => {
    writeRegistryFixture(['doc-feature']);
    // fixture phase is 'plan' → docs/01-plan/features/<feature>.plan.en.md
    const planDir = path.join(tmpRoot, 'docs', '01-plan', 'features');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, 'doc-feature.plan.en.md'), '# plan\n');

    const verdict = shouldSkipAutoTransition({ session_id: GATE_SESSION });

    expect(verdict).toEqual({ skip: false, gate: null });
  });

  test('unknown feature name (no registry row) yields no skip', () => {
    writeRegistryFixture([]);

    const verdict = shouldSkipAutoTransition({ session_id: GATE_SESSION });

    expect(verdict).toEqual({ skip: false, gate: null });
  });

  test('both stop scripts carry the stale-evidence gate in parity', () => {
    const unified = fs.readFileSync(UNIFIED_SCRIPT, 'utf8');
    const skillStop = fs.readFileSync(STOP_SCRIPT, 'utf8');
    const marker = "gate: 'stale-evidence'";
    expect(unified).toContain(marker);
    expect(skillStop).toContain(marker);
    expect(unified.split(marker).length).toBe(skillStop.split(marker).length);
  });
});