/*
 * docs-code-sync-vault.test.js — br200 vault-target fence-mode contract tests.
 *
 * Verifies:
 *   (a) fenceMode crossCheck on the 3 real vault files → 0 discrepancies.
 *   (b) temp fixture with a wrong count inside fences → 1 discrepancy naming
 *       the file.
 *   (c) broken-fence fixture → a single `_fenceError` finding.
 *   (d) crossCheck WITHOUT fenceMode on a fenced file → current whole-file
 *       behavior (default path untouched).
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error(`✗ ${name}: ${e.message}`); } }
async function testAsync(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.error(`✗ ${name}: ${e.message}`); } }

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const scanner = require('../../lib/infra/docs-code-scanner');

const VAULT_FILES = [
  'bkit-system/README.md',
  'bkit-system/_GRAPH-INDEX.md',
  'bkit-system/philosophy/core-mission.md',
];

const BEGIN = '<!-- docs-code-sync:begin -->';
const END = '<!-- docs-code-sync:end -->';

(async () => {

// ============================================================
// (a) Real vault files: fenceMode scan → 0 discrepancies
// ============================================================
for (const rel of VAULT_FILES) {
  await testAsync(`fenceMode crossCheck clean on ${rel}`, async () => {
    const diffs = await scanner.crossCheck(rel, { fenceMode: true });
    assert.deepStrictEqual(diffs, [], JSON.stringify(diffs));
  });
}

// ============================================================
// (b) Temp fixture: wrong count inside fences → 1 discrepancy
// ============================================================
await testAsync('fenceMode flags wrong count inside fences', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br200-vault-'));
  try {
    const f = path.join(dir, 'fixture.md');
    fs.writeFileSync(f, [
      'prose around it',
      BEGIN,
      'This vault ships 999 Skills today.',
      END,
      'more prose',
    ].join('\n'));
    const diffs = await scanner.crossCheck(f, { fenceMode: true });
    assert.strictEqual(diffs.length, 1, JSON.stringify(diffs));
    assert.strictEqual(diffs[0].docPath, f);
    assert.ok(diffs[0].field !== '_fenceError', 'should be a count drift, not a fence error');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// (c) Broken-fence fixture → _fenceError finding
// ============================================================
await testAsync('fenceMode reports _fenceError on unbalanced begin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br200-broken-'));
  try {
    const f = path.join(dir, 'broken.md');
    fs.writeFileSync(f, [BEGIN, '44 Skills, never closed'].join('\n'));
    const diffs = await scanner.crossCheck(f, { fenceMode: true });
    assert.strictEqual(diffs.length, 1, JSON.stringify(diffs));
    assert.strictEqual(diffs[0].field, '_fenceError');
    assert.ok(diffs[0].fenceError.includes('never closed'), diffs[0].fenceError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await testAsync('fenceMode reports _fenceError on stray end', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br200-stray-'));
  try {
    const f = path.join(dir, 'stray.md');
    fs.writeFileSync(f, ['prose', END, 'after'].join('\n'));
    const diffs = await scanner.crossCheck(f, { fenceMode: true });
    assert.strictEqual(diffs.length, 1, JSON.stringify(diffs));
    assert.strictEqual(diffs[0].field, '_fenceError');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// (d) Default path untouched: no fenceMode → whole-file scan
// ============================================================
await testAsync('without fenceMode, fenced counts still scanned (whole file)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br200-default-'));
  try {
    const f = path.join(dir, 'whole.md');
    // Wrong count inside fences: default mode (whole file) MUST still flag it.
    fs.writeFileSync(f, [
      'prose',
      BEGIN,
      'This repo has 999 Skills.',
      END,
      'prose',
    ].join('\n'));
    const diffs = await scanner.crossCheck(f);
    assert.strictEqual(diffs.length, 1, JSON.stringify(diffs));
    assert.strictEqual(diffs[0].docPath, f);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await testAsync('without fenceMode, clean fenced block → no drift', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br200-clean-'));
  try {
    const f = path.join(dir, 'clean.md');
    fs.writeFileSync(f, [BEGIN, 'No counts in this block.', END].join('\n'));
    const diffs = await scanner.crossCheck(f);
    assert.deepStrictEqual(diffs, [], JSON.stringify(diffs));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// Summary
// ============================================================
console.log(`\ndocs-code-sync-vault.test.js: ${pass}/${pass + fail} PASS, ${fail} FAIL, 0 SKIP`);
if (fail > 0) process.exit(1);

})();
