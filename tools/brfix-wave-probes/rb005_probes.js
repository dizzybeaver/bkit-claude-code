'use strict';

/**
 * rb005_probes.js — rb005 fix-wave verification probes.
 *
 * Six probes for the rb005 cross-session-bleed fix in
 * scripts/pdca-skill-stop.js (Design §8, docs/02-design/features/
 * rb005-stop-cross-session-bleed.design.en.md):
 *
 *   T1 FR-01 foreign   phase-derived action + live foreign owner -> allow + stderr note
 *   T2 FR-01 owner     same registry, owner session -> NOT suppressed by FR-01
 *   T3 FR-02 downgrade owner, manual automation, directive-less ack -> allow + stderr note
 *   T4 FR-02 retained  owner, full-auto -> [AUTO-TRANSITION] guidance still blocks
 *   T5 syntax          node --check on the modified hook
 *   T6 lease-expiry    foreign owner with expired lease -> still suppressed
 *
 * Usage:
 *   node tools/brfix-wave-probes/rb005_probes.js          # all six
 *   node tools/brfix-wave-probes/rb005_probes.js T1 T3    # subset
 *
 * All runs use an os.tmpdir() fixture (CLAUDE_PROJECT_DIR +
 * CLAUDE_PLUGIN_DATA pointed at it) — the real .bkit/ is never touched.
 *
 * @module tools/brfix-wave-probes/rb005_probes
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pdca-skill-stop.js');

const results = [];

function report(id, pass, detail) {
  results.push({ id, pass });
  console.log(`\n[${id}] ${pass ? 'PASS' : 'FAIL'}`);
  console.log(detail.trim());
}

function buildFixture(ownerSession, ownerSinceMs) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'rb005-probe-'));
  const stateDir = path.join(proj, '.bkit', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(path.join(proj, 'plugindata'), { recursive: true });
  const entry = {
    phase: 'do',
    startedAt: new Date().toISOString(),
  };
  if (ownerSession) {
    entry.ownerSession = ownerSession;
    entry.ownerSince = new Date(ownerSinceMs).toISOString();
  }
  fs.writeFileSync(
    path.join(stateDir, 'pdca-status.json'),
    JSON.stringify({
      version: '2.0',
      features: { 'rb005-fixture': entry },
      primaryFeature: 'rb005-fixture',
    }, null, 2),
  );
  return { proj, registryPath: path.join(stateDir, 'pdca-status.json') };
}

function runStop(fx, sessionId, automation) {
  const payload = JSON.stringify({
    session_id: sessionId,
    cwd: fx.proj,
    hook_event_name: 'Stop',
    stop_hook_active: false,
    // no transcript_path: envelope and text tiers must both miss, forcing the
    // phase-derived action tier that rb005 bleeds through
  });
  const env = { ...process.env };
  delete env.BKIT_VERBOSE_VALIDATION;
  env.CLAUDE_PROJECT_DIR = fx.proj;
  env.CLAUDE_PLUGIN_DATA = path.join(fx.proj, 'plugindata');
  if (automation) env.BKIT_PDCA_AUTOMATION = automation;
  else delete env.BKIT_PDCA_AUTOMATION;
  return spawnSync(process.execPath, [STOP_SCRIPT], {
    input: payload, cwd: fx.proj, env, encoding: 'utf8', timeout: 30000,
  });
}

const FOREIGN = 'rb005-foreign-session';
const OWNER = 'rb005-owner-session';

function probeT1() {
  const fx = buildFixture(OWNER, Date.now());
  const run = runStop(fx, FOREIGN);
  const stdout = (run.stdout || '').trim();
  const pass = run.status === 0
    && stdout === '{}'
    && /owned by another session/.test(run.stderr || '');
  report('T1-fr01-foreign', pass, [
    `exit=${run.status} stdout=${stdout || '(empty)'}`,
    `stderr=${(run.stderr || '').trim().slice(0, 200)}`,
  ].join('\n'));
  fs.rmSync(fx.proj, { recursive: true, force: true });
}

function probeT2() {
  const fx = buildFixture(OWNER, Date.now());
  const run = runStop(fx, OWNER, 'full-auto');
  const stderr = (run.stderr || '').trim();
  const pass = run.status === 0 && !/owned by another session/.test(stderr);
  report('T2-fr01-owner', pass, [
    `exit=${run.status}`,
    `stdout(first 200)=${(run.stdout || '').trim().slice(0, 200) || '(empty)'}`,
    `stderr(first 200)=${stderr.slice(0, 200) || '(empty)'}`,
  ].join('\n'));
  fs.rmSync(fx.proj, { recursive: true, force: true });
}

function probeT3() {
  const fx = buildFixture(OWNER, Date.now());
  const run = runStop(fx, OWNER, 'manual');
  const stdout = (run.stdout || '').trim();
  const pass = run.status === 0
    && stdout === '{}'
    && /informational only, not blocking \(rb005 FR-02\)/.test(run.stderr || '');
  report('T3-fr02-downgrade', pass, [
    `exit=${run.status} stdout=${stdout || '(empty)'}`,
    `stderr=${(run.stderr || '').trim().slice(0, 200)}`,
  ].join('\n'));
  fs.rmSync(fx.proj, { recursive: true, force: true });
}

function probeT4() {
  const fx = buildFixture(OWNER, Date.now());
  const run = runStop(fx, OWNER, 'full-auto');
  const stdout = (run.stdout || '').trim();
  let blockedWithDirective = false;
  try {
    const out = JSON.parse(stdout);
    blockedWithDirective = out.decision === 'block'
      && /\[AUTO-TRANSITION\]|\[PDCA-COMPLETE\]/.test(out.reason || '');
  } catch (_) { /* non-JSON stdout counts as fail */ }
  report('T4-fr02-retained', blockedWithDirective, [
    `stdout=${stdout.slice(0, 300) || '(empty)'}`,
  ].join('\n'));
  fs.rmSync(fx.proj, { recursive: true, force: true });
}

function probeT5() {
  const run = spawnSync(process.execPath, ['--check', STOP_SCRIPT], {
    encoding: 'utf8', timeout: 15000,
  });
  report('T5-syntax', run.status === 0,
    `node --check exit=${run.status} ${(run.stderr || '').trim().slice(0, 200)}`);
}

function probeT6() {
  const stale = Date.now() - (3 * 60 * 60 * 1000); // older than OWNER_LEASE_MS (2h)
  const fx = buildFixture(OWNER, stale);
  const run = runStop(fx, FOREIGN);
  const stdout = (run.stdout || '').trim();
  const pass = run.status === 0
    && stdout === '{}'
    && /owned by another session/.test(run.stderr || '');
  report('T6-lease-expiry', pass, [
    `exit=${run.status} stdout=${stdout || '(empty)'}`,
    `stderr=${(run.stderr || '').trim().slice(0, 200)}`,
  ].join('\n'));
  fs.rmSync(fx.proj, { recursive: true, force: true });
}

const PROBES = { T1: probeT1, T2: probeT2, T3: probeT3, T4: probeT4, T5: probeT5, T6: probeT6 };
const requested = process.argv.slice(2).filter((a) => PROBES[a]);
const ids = requested.length ? requested : Object.keys(PROBES);
ids.forEach((id) => PROBES[id]());

const failed = results.filter((r) => !r.pass);
console.log(`\n=== rb005 probes: ${results.length - failed.length}/${results.length} PASS ===`);
if (failed.length) {
  console.log(`failed: ${failed.map((r) => r.id).join(', ')}`);
  process.exit(1);
}
