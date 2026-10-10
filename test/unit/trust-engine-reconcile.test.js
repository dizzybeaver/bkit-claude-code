/**
 * trust-engine-reconcile.test.js — Unit tests for FR-γ1 reconcile API.
 *
 * Maps to Sprint γ Design §4.1 reconcile() contract + dead-code
 * invariant (3 flags must be read at runtime).
 *
 * @module test/unit/trust-engine-reconcile.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const trustEngine = require('../../lib/control/trust-engine');

// ── br045 sandbox ────────────────────────────────────────────────────────
// The reconcile() tests below reach syncToControlState → REAL control-state.json
// writes (a low synthetic trust score maps to level 1 — the SC-1 poisoner).
// They run against a throwaway CLAUDE_PROJECT_DIR instead. syncToControlState
// resolves PROJECT_DIR lazily (trust-engine.js:495, require('../core/platform'))
// and early-returns when control-state.json is absent, so reconcile's return
// semantics are unchanged in the sandbox; the purge MUST cover the lib/core/
// BARREL (a barrel loaded before the sandbox pins a stale platform PROJECT_DIR).
function purgeCache(re) {
  Object.keys(require.cache).forEach(k => { if (re.test(k)) delete require.cache[k]; });
}
const TRUST_PURGE = /lib\/(core\/|control\/(automation-controller|trust-engine))/;
const realStatePath = path.resolve(__dirname, '../../.bkit/runtime/control-state.json');
let realStateBefore = null;
try { realStateBefore = fs.readFileSync(realStatePath, 'utf8'); } catch (_) { /* absent is fine */ }

function withSandboxedTrustEngine(fn) {
  const os = require('os');
  const saved = process.env.CLAUDE_PROJECT_DIR;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-sandbox-'));
  try {
    process.env.CLAUDE_PROJECT_DIR = tmp;
    purgeCache(TRUST_PURGE);
    fn(require('../../lib/control/trust-engine'));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
    purgeCache(TRUST_PURGE); // later suites re-require the REAL modules
  }
}

// ── Public surface ───────────────────────────────────────────────────────
test('trust-engine exports reconcile()', () => {
  assert.equal(typeof trustEngine.reconcile, 'function');
});

test('trust-engine exports syncToControlState()', () => {
  assert.equal(typeof trustEngine.syncToControlState, 'function');
});

test('reconcile: returns ok when not skipped', () => {
  withSandboxedTrustEngine((sandboxed) => {
    const r = sandboxed.reconcile({ trigger: 'test.unit' });
    assert.equal(r.ok, true);
    assert.equal(typeof r.flags, 'object');
  });
});

test('reconcile: surfaces all 3 flags in result', () => {
  withSandboxedTrustEngine((sandboxed) => {
    const r = sandboxed.reconcile();
    assert.ok(r.flags);
    for (const k of ['trustEnabled', 'autoEscalation', 'autoDowngrade']) {
      assert.ok(Object.prototype.hasOwnProperty.call(r.flags, k),
        `flag ${k} must surface in reconcile result`);
      assert.equal(typeof r.flags[k], 'boolean', `${k} must be boolean`);
    }
  });
});

test('reconcile: trigger defaults to "manual" when omitted', () => {
  withSandboxedTrustEngine((sandboxed) => {
    const r = sandboxed.reconcile();
    // ok or skipped — both acceptable depending on config.trustScoreEnabled
    if (!r.skipped) {
      assert.equal(r.trigger, 'manual');
    }
  });
});

test('reconcile: explicit trigger preserved', () => {
  withSandboxedTrustEngine((sandboxed) => {
    const r = sandboxed.reconcile({ trigger: 'pdca.do.completed' });
    if (!r.skipped) {
      assert.equal(r.trigger, 'pdca.do.completed');
    }
  });
});

// br045 redirection proof (absence-tolerant): the sandboxed reconcile calls must
// not have touched the real control-state.json. Runs after the 4 tests above
// (node:test registration order).
test('br045: real control-state.json untouched by the sandboxed reconcile calls', () => {
  if (realStateBefore === null) {
    assert.equal(fs.existsSync(realStatePath), false,
      'real state file must stay absent');
  } else {
    assert.equal(fs.readFileSync(realStatePath, 'utf8'), realStateBefore,
      'real control-state.json must be byte-identical after the sandboxed reconcile tests');
  }
});

// ── Dead-code invariant: 3 flags MUST be read in trust-engine.js ─────────
test('dead-code invariant: trust-engine.js reads automation.trustScoreEnabled', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../lib/control/trust-engine.js'), 'utf8');
  assert.ok(src.includes("'automation.trustScoreEnabled'"),
    'trustScoreEnabled flag must be read at runtime');
});

test('dead-code invariant: trust-engine.js reads automation.autoEscalation', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../lib/control/trust-engine.js'), 'utf8');
  assert.ok(src.includes("'automation.autoEscalation'"));
});

test('dead-code invariant: trust-engine.js reads automation.autoDowngrade', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../lib/control/trust-engine.js'), 'utf8');
  assert.ok(src.includes("'automation.autoDowngrade'"));
});

// ── Config presence (bkit.config.json#automation 3 flags) ────────────────
test('config invariant: bkit.config.json#automation.trustScoreEnabled present', () => {
  const cfg = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../bkit.config.json'), 'utf8'));
  assert.ok(cfg.automation, 'automation block must exist');
  assert.ok(Object.prototype.hasOwnProperty.call(cfg.automation, 'trustScoreEnabled'));
});

test('config invariant: bkit.config.json#automation.autoEscalation present', () => {
  const cfg = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../bkit.config.json'), 'utf8'));
  assert.ok(Object.prototype.hasOwnProperty.call(cfg.automation, 'autoEscalation'));
});

test('config invariant: bkit.config.json#automation.autoDowngrade present', () => {
  const cfg = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../bkit.config.json'), 'utf8'));
  assert.ok(Object.prototype.hasOwnProperty.call(cfg.automation, 'autoDowngrade'));
});

// ── Runtime caller invariant: at least 1 runtime caller wires it up ──────
test('runtime caller invariant: syncToControlState or reconcile called outside trust-engine', () => {
  const candidates = [
    path.resolve(__dirname, '../../scripts/unified-stop.js'),
    path.resolve(__dirname, '../../lib/control/automation-controller.js'),
  ];
  let found = false;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (/syncToControlState\s*\(/.test(src) || /\.reconcile\s*\(/.test(src)) {
      found = true; break;
    }
  }
  assert.equal(found, true,
    'At least one runtime caller must invoke syncToControlState() or reconcile()');
});
