'use strict';
/**
 * Regression test: the release verifier's check K must skip, not fail, on a
 * fresh clone. 3 TC | console.assert based | no external dependencies
 *
 * `.bkit/` has no tracked files, so the v2114 sprint state file is absent on
 * every fresh clone; check K used to throw and turn the whole verdict to FAIL.
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

console.log('\n=== verify-full-system-skip.test.js ===\n');

// The script anchors ROOT at its own parent directory, so a copy inside an
// empty tree is a clone without `.bkit/`, whatever the real checkout holds.
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-verify-skip-'));
fs.mkdirSync(path.join(tree, 'scripts'));
fs.copyFileSync(path.join(REPO, 'scripts/verify-full-system.js'), path.join(tree, 'scripts/verify-full-system.js'));

function run(flag) {
  return spawnSync('node', [path.join(tree, 'scripts/verify-full-system.js'), flag], { encoding: 'utf8', timeout: 60000 });
}

let k = null;
try {
  const json = JSON.parse(run('--json').stdout);
  k = json.categories.K_sprint_state_machine;
} catch (_e) { /* asserted below */ }
const md = run('--md').stdout || '';
fs.rmSync(tree, { recursive: true, force: true });

assert('VS-001', k && k.ok === true && k.skipped === true,
  'check K reports skipped (ok, not an error) when the sprint state file is absent');
assert('VS-002', k && !k.error, 'check K does not throw on a tree without .bkit');
assert('VS-003', /K_sprint_state_machine \| ✅ \| SKIP/.test(md),
  'the report row for check K reads SKIP');

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
