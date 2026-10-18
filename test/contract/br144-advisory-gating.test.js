#!/usr/bin/env node
/**
 * br144-advisory-gating contract test (br144-hook-noise-gating).
 *
 * Verifies the hooks.advisory.* config gates:
 *   - default (no config section) = silent: no advisory injection from any
 *     of the 4 bkit emitters
 *   - var=true restores each emitter's output
 *   - strict-true contract ("true" string / 1 = suppressed)
 *   - functional emitters (ENH-310/G-019 guards, PDCA transitions) untouched
 *   - malformed config = silent no-crash
 *   - remember prompt_stamp=off config present
 *
 * Standalone Node assert-runner (repo convention — no jest).
 * Behavior tests run the REAL hook scripts as child processes with fixture
 * CLAUDE_PROJECT_DIR (temp) + fixture .bkit registry, like a live session.
 *
 * Fixture notes (verified against source):
 * - advisoryGateOpen (br048) needs a non-terminal registry feature with a
 *   recent timestamps.lastUpdated (<6h) — otherwise the envelope never fires
 *   and TS-2 could not distinguish gate-vs-gate-closed.
 * - unified-stop's "Stop event processed." ack lives under `if (!handled)`
 *   (no PDCA handler matched) — so its scenarios use a registry-LESS project.
 * - subagent-stop's gated acks are its error branches (malformed stdin /
 *   team-module missing) — driven with malformed stdin.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok: ${name}`); }
  catch (e) { fail++; console.error(`  FAIL: ${name}\n      ${e && e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// --- fixture trees -----------------------------------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'br144-'));        // WITH registry
const TMP2 = fs.mkdtempSync(path.join(os.tmpdir(), 'br144-noreg-')); // registry-LESS
const STATE_DIR = path.join(TMP, '.bkit', 'state');
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(path.join(STATE_DIR, 'pdca-status.json'), JSON.stringify({
  version: '3.0',
  features: { demo: {
    phase: 'plan', ownerSession: 'sess-fixture',
    ownerSince: new Date().toISOString(),
    timestamps: { lastUpdated: new Date().toISOString() },  // br048 recency window
  } },
  primaryFeature: 'demo', activeFeatures: ['demo'],
}));
function writeConfig(advisory) {
  const cfg = { version: '2.1.40' };
  if (advisory !== undefined) cfg.hooks = { advisory };
  for (const dir of [TMP, TMP2]) {
    fs.writeFileSync(path.join(dir, 'bkit.config.json'), JSON.stringify(cfg, null, 2));
  }
}
function runIn(dir, script, stdinObj, rawStdin) {
  const r = spawnSync('node', [path.join(ROOT, script)], {
    input: rawStdin !== undefined ? rawStdin : JSON.stringify(stdinObj || {}),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8', timeout: 30000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}
const CLASSIFIER_PROMPT = { prompt: 'help me plan the pdca design phase for the auth feature', session_id: 'sess-fixture' };
const FEATURE_PROMPT = { prompt: 'we should implement a new feature for user onboarding', session_id: 'sess-fixture' };

// --- TS-1: default (no hooks.advisory section) = silent ---------------------
writeConfig(undefined);
test('TS-1a classifier envelope silent by default', () => {
  const r = runIn(TMP, 'scripts/user-prompt-handler.js', CLASSIFIER_PROMPT);
  assert(!/Suggested agent:/.test(r.stdout), 'Suggested agent leaked: ' + r.stdout.slice(0, 200));
  assert(!/Relevant skill:/.test(r.stdout), 'Relevant skill leaked');
  assert(!/Template structure for/.test(r.stdout), 'Template dump leaked');
  assert(!/Request may be ambiguous/.test(r.stdout), 'Ambiguity line leaked');
});
test('TS-1b feature-detector silent by default', () => {
  const r = runIn(TMP, 'scripts/user-prompt-handler.js', FEATURE_PROMPT);
  assert(!/New feature detected/.test(r.stdout), 'feature line leaked: ' + r.stdout.slice(0, 200));
});
test('TS-1c ack emitters silent by default', () => {
  for (const [script, marker] of [
    ['scripts/subagent-stop-handler.js', 'SubagentStop processed.'],
    ['scripts/subagent-start-handler.js', 'SubagentStart processed.'],
    ['scripts/team-idle-handler.js', 'TeammateIdle processed.'],
  ]) {
    const r = runIn(TMP2, script, null, 'not-json');  // error branch carries the gated ack
    assert(!r.stdout.includes(marker), `${script} ack leaked: ${r.stdout.slice(0, 120)}`);
  }
});
test('TS-1d unified-stop ack silent by default (no handler matched)', () => {
  const r = runIn(TMP2, 'scripts/unified-stop.js', { session_id: 'sess-none' });
  assert(!r.stdout.includes('Stop event processed.'), 'stop ack leaked: ' + r.stdout.slice(0, 200));
});

// --- TS-2: var=true restores -------------------------------------------------
test('TS-2a classifierEnvelope=true restores envelope', () => {
  writeConfig({ classifierEnvelope: true });
  const r = runIn(TMP, 'scripts/user-prompt-handler.js', CLASSIFIER_PROMPT);
  assert(/Suggested agent:|Relevant skill:|Request may be ambiguous|Template structure for/.test(r.stdout),
    'envelope not restored: ' + r.stdout.slice(0, 200));
});
test('TS-2b featureDetector=true restores feature line', () => {
  writeConfig({ featureDetector: true });
  const r = runIn(TMP, 'scripts/user-prompt-handler.js', { prompt: 'we should implement a feature called onboarding', session_id: 'sess-fixture' });
  assert(/New feature detected/.test(r.stdout), 'feature line not restored: ' + r.stdout.slice(0, 200));
});
test('TS-2c ackMessages gate wraps every ack site (source-level)', () => {
  // Behavioral restore is covered for classifierEnvelope/featureDetector/unified-stop
  // (TS-2a/b/d). The subagent/team ack sites sit on environment-dependent branches
  // (team mode enabled here), so their restore is asserted at source level: every
  // ack outputAllow in the 4 files must sit behind an isAdvisoryEnabled wrapper.
  const expected = {
    'scripts/unified-stop.js': 1,
    'scripts/subagent-stop-handler.js': 2,
    'scripts/team-idle-handler.js': 2,
    'scripts/subagent-start-handler.js': 2,
  };
  for (const [f, n] of Object.entries(expected)) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const gates = (s.match(/isAdvisoryEnabled\('ackMessages'\)/g) || []).length;
    assert(gates === n, `${f}: ${gates} ack gates, expected ${n}`);
    const wrapped = (s.match(/isAdvisoryEnabled\('ackMessages'\)\) \{[^}]*outputAllow\(/g) || []).length;
    assert(wrapped === n, `${f}: ${wrapped} ack calls wrapped, expected ${n}`);
  }
});
test('TS-2d unified-stop ackMessages=true restores ack', () => {
  // writeConfig() replaces the shared config wholesale and prior TS-2 tests set
  // only their own key, so ackMessages must be (re-)written here or the gate is
  // legitimately false and the restore premise never holds.
  writeConfig({ ackMessages: true });
  const r = runIn(TMP2, 'scripts/unified-stop.js', { session_id: 'sess-none' });
  assert(r.stdout.includes('Stop event processed.'), 'stop ack not restored: ' + r.stdout.slice(0, 200));
});

// --- TS-4: strict-true contract ---------------------------------------------
test('TS-4 string "true"/number do not enable', () => {
  writeConfig({ classifierEnvelope: 'true' });
  let r = runIn(TMP, 'scripts/user-prompt-handler.js', CLASSIFIER_PROMPT);
  assert(!/Suggested agent:/.test(r.stdout), 'string "true" enabled envelope');
  writeConfig({ classifierEnvelope: 1 });
  r = runIn(TMP, 'scripts/user-prompt-handler.js', CLASSIFIER_PROMPT);
  assert(!/Suggested agent:/.test(r.stdout), 'numeric 1 enabled envelope');
});

// --- TS-5: functional emitters untouched (source-level) ---------------------
test('TS-5 functional emitters carry no br144 gates', () => {
  for (const f of ['scripts/unified-bash-pre.js', 'scripts/pdca-skill-stop.js', 'hooks/session-start.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!s.includes('br144'), `${f} unexpectedly gated`);
  }
});

// --- TS-6: malformed config = silent no-crash --------------------------------
test('TS-6 malformed config is fail-quiet', () => {
  fs.writeFileSync(path.join(TMP, 'bkit.config.json'), '{invalid json');
  const r = runIn(TMP, 'scripts/user-prompt-handler.js', CLASSIFIER_PROMPT);
  assert(r.status === 0, 'handler crashed on malformed config: ' + r.status);
  assert(!/Suggested agent:/.test(r.stdout), 'advisory leaked on malformed config');
});

// --- TS-7: remember prompt_stamp=off config present --------------------------
test('TS-7 remember user config gates the timestamp', () => {
  const cfgPath = path.join(os.homedir(), '.remember', 'config.json');
  assert(fs.existsSync(cfgPath), 'remember config missing: ' + cfgPath);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert(cfg.prompt_stamp === 'off', 'prompt_stamp is not off: ' + JSON.stringify(cfg.prompt_stamp));
});

// --- TS-8 prep: gate markers present (mutation target) -----------------------
test('TS-8-prep gate markers present in all 4 bkit emitter files', () => {
  for (const f of ['scripts/user-prompt-handler.js', 'scripts/unified-stop.js',
                   'scripts/subagent-stop-handler.js', 'scripts/team-idle-handler.js',
                   'scripts/subagent-start-handler.js', 'hooks/startup/session-context.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(s.includes('br144'), `${f} missing br144 gate markers`);
  }
});

// --- summary -----------------------------------------------------------------
console.log(`\n== results: ${pass} passed, ${fail} failed ==`);
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(TMP2, { recursive: true, force: true });
process.exit(fail > 0 ? 1 : 0);
