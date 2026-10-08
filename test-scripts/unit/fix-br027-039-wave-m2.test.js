/**
 * fix-br027-039-wave-m2.test.js — M2 phase test suite (br032, br033, br035, br029, br027)
 *
 * Covers the m2-phase agent's fixes:
 *   br032 — lib/pdca/phase.js PDCA_PHASES gains 'completed' (order 9)
 *   br033 — validatePdcaTransition terminal-state guards (archived/completed)
 *   br035 — lib/pdca/state-transitions.js TIMEOUT/ABANDON dead edges removed
 *   br029 — scripts/gap-detector-stop.js nextStep.message -> nextStep
 *   br027 — gap-detector-stop.js updatePdcaStatus check call passes requireDocs:false
 *
 * Mutation note: br033 tests assert exact { valid: false } results — removing
 * a terminal guard flips them to valid:true and fails the test. br029/br027
 * tests assert source-level properties that disappear if the fix is reverted.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const phase = require('../../lib/pdca/phase');
const transitions = require('../../lib/pdca/state-transitions');

describe('br032: PDCA_PHASES includes completed (order 9)', () => {
  test("getPhaseNumber('completed') === 9, not 0", () => {
    const n = phase.getPhaseNumber('completed');
    expect(n).toBe(9);
    expect(n).not.toBe(0);
  });

  test("'archived' is still order 8", () => {
    expect(phase.getPhaseNumber('archived')).toBe(8);
  });

  test('archived (8) < completed (9) ordering preserved', () => {
    expect(phase.getPhaseNumber('archived')).toBeLessThan(
      phase.getPhaseNumber('completed')
    );
  });

  test("getPhaseName(9) resolves back to 'completed'", () => {
    expect(phase.getPhaseName(9)).toBe('completed');
  });
});

describe('br033: validatePdcaTransition terminal-state guards', () => {
  test('archived -> report is rejected (archived is terminal)', () => {
    const r = phase.validatePdcaTransition('f', 'archived', 'report');
    expect(r.valid).toBe(false);
  });

  test('completed -> plan is rejected (completed is terminal)', () => {
    const r = phase.validatePdcaTransition('f', 'completed', 'plan');
    expect(r.valid).toBe(false);
  });

  test('completed -> archived is allowed (completion -> archive path)', () => {
    const r = phase.validatePdcaTransition('f', 'completed', 'archived');
    expect(r.valid).toBe(true);
  });

  test('normal backward move design -> plan still allowed', () => {
    const r = phase.validatePdcaTransition('f', 'design', 'plan');
    expect(r.valid).toBe(true);
  });

  // NOTE: forward moves (+1 order) are deliverable-gated by PRE-EXISTING design —
  // validatePdcaTransition runs checkPhaseDeliverables(fromPhase) on forward moves
  // and returns { valid: false, reason: 'check deliverable not found' } when the
  // feature lacks the phase's required doc. That gate is untouched by br033; a
  // fixture feature with no docs cannot assert valid:true on a forward move.
  // So the no-docs positive case uses a BACKWARD move (qa 6 -> act 5), which
  // short-circuits 'Returning to earlier phase' before the deliverable check.
  test('backward move qa -> act still allowed', () => {
    const r = phase.validatePdcaTransition('f', 'qa', 'act');
    expect(r.valid).toBe(true);
    expect(r.reason).toBe('Returning to earlier phase');
  });
});

describe('br035: TIMEOUT/ABANDON dead edges removed from state-transitions', () => {
  test('module still loads and exposes its API', () => {
    expect(transitions).toBeDefined();
    expect(typeof transitions).toBe('object');
  });

  test('no TIMEOUT/ABANDON anywhere in the exported machine data', () => {
    const serialized = JSON.stringify(transitions);
    expect(serialized).not.toContain('TIMEOUT');
    expect(serialized).not.toContain('ABANDON');
  });
});

describe('br029: gap-detector-stop.js no longer dereferences nextStep.message', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'scripts', 'gap-detector-stop.js'),
    'utf-8'
  );

  test("source contains no 'nextStep.message'", () => {
    expect(src).not.toContain('nextStep.message');
  });

  test("doc-generation fallback uses 'nextStep || N/A' string", () => {
    expect(src).toContain("nextStep || 'N/A'");
  });
});

describe('br027: gap-detector-stop.js check-phase updatePdcaStatus bypasses the docs gate', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'scripts', 'gap-detector-stop.js'),
    'utf-8'
  );

  test("updatePdcaStatus(feature, 'check', ...) call carries requireDocs: false", () => {
    const callRe = /updatePdcaStatus\(\s*feature,\s*'check',\s*\{[\s\S]*?\}\s*,\s*\{\s*requireDocs:\s*false\s*\}\s*\)/;
    expect(callRe.test(src)).toBe(true);
  });
});
