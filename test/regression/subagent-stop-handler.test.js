'use strict';
/**
 * Regression test for issue #162: SubagentStop must not emit additionalContext.
 * 2 TC | console.assert based | no external dependencies
 *
 * SubagentStop has no additionalContext channel, so the next-action hint is
 * carried by systemMessage only.
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

console.log('\n=== subagent-stop-handler.test.js ===\n');

// A failed stop (non-zero exit, no transcript) always produces a [SUGGEST] hint.
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-substop-'));
const r = spawnSync('node', [path.join(REPO, 'scripts/subagent-stop-handler.js')], {
  input: JSON.stringify({ agent_type: 'cto-lead', agent_id: 'a1', exit_code: 1 }),
  encoding: 'utf8',
  timeout: 10000,
  env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_ROOT: REPO, BKIT_DEBUG: '' },
});
fs.rmSync(projectDir, { recursive: true, force: true });

let out = null;
try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (_e) { /* asserted below */ }

assert('SS-001', out && /\[SUGGEST\]/.test(out.systemMessage || ''),
  'the next-action hint still reaches the user through systemMessage');
assert('SS-002', out && out.hookSpecificOutput && !('additionalContext' in out.hookSpecificOutput),
  'hookSpecificOutput has no additionalContext field');

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
