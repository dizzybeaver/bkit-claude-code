'use strict';
/**
 * Regression test: skill instructions must point at templates through the plugin root.
 * 1 TC | console.assert based | no external dependencies
 *
 * Templates ship in the plugin's templates/ directory. A bare `templates/x.template.md`
 * resolves against the user's project (or the skill directory), where no template
 * exists, so the "Template Loading" step cannot be followed. Claude Code substitutes
 * ${CLAUDE_PLUGIN_ROOT} in plugin skill content.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

let passed = 0, failed = 0, total = 0, skipped = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

console.log('\n=== skill-template-paths.test.js ===\n');

// A backticked template path whose first segment is `templates/` has no root.
const BARE_TEMPLATE_PATH = /`templates\/[\w.-]+\.template\.md`/g;

const skillsDir = path.join(REPO, 'skills');
const offenders = [];
for (const name of fs.readdirSync(skillsDir)) {
  const file = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(BARE_TEMPLATE_PATH)) offenders.push(`skills/${name}/SKILL.md:${i + 1} ${m[0]}`);
  });
}

assert('STP-001', offenders.length === 0,
  `no skill references a template without \${CLAUDE_PLUGIN_ROOT}${offenders.length ? ': ' + offenders.join(', ') : ''}`);

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
