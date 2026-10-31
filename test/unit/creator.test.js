'use strict';
/**
 * Unit Tests for lib/task/creator.js
 * 27 TC | console.assert based | no external dependencies
 */

let mod;
try {
  mod = require('../../lib/task/creator');
} catch (e) {
  console.error('Module load failed:', e.message);
  process.exit(1);
}

let phaseMod;
try {
  phaseMod = require('../../lib/pdca/phase');
} catch (e) {
  console.error('Phase module load failed:', e.message);
  process.exit(1);
}

let passed = 0, failed = 0, total = 0;

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; console.error(`  FAIL: ${id} - ${message}`); }
}

console.log('\n=== creator.test.js ===\n');

// --- Exports ---
assert('U-CRT-001', typeof mod.generatePdcaTaskSubject === 'function', 'generatePdcaTaskSubject exported');
assert('U-CRT-002', typeof mod.generatePdcaTaskDescription === 'function', 'generatePdcaTaskDescription exported');
assert('U-CRT-003', typeof mod.getPdcaTaskMetadata === 'function', 'getPdcaTaskMetadata exported');
assert('U-CRT-004', typeof mod.generateTaskGuidance === 'function', 'generateTaskGuidance exported');

// --- generatePdcaTaskSubject ---
const subj1 = mod.generatePdcaTaskSubject('plan', 'auth-feature');
assert('U-CRT-007', subj1.includes('[Plan]'), 'Subject contains capitalized phase');
assert('U-CRT-008', subj1.includes('auth-feature'), 'Subject contains feature name');

const subj2 = mod.generatePdcaTaskSubject('do', 'payment');
assert('U-CRT-009', subj2.includes('[Do]'), 'Do phase capitalized');

const subj3 = mod.generatePdcaTaskSubject('check', 'test-feat');
assert('U-CRT-010', subj3.includes('[Check]'), 'Check phase');

const subj4 = mod.generatePdcaTaskSubject('unknown', 'feat');
assert('U-CRT-011', subj4.includes('feat'), 'Unknown phase still contains feature');

// --- generatePdcaTaskDescription ---
const desc1 = mod.generatePdcaTaskDescription('plan', 'auth-feature');
assert('U-CRT-012', desc1.includes('Plan phase'), 'Plan description text');
assert('U-CRT-013', desc1.includes('auth-feature'), 'Description contains feature');

const desc2 = mod.generatePdcaTaskDescription('design', 'auth', '/docs/design.md');
assert('U-CRT-014', desc2.includes('Reference: /docs/design.md'), 'DocPath included in description');

const desc3 = mod.generatePdcaTaskDescription('do', 'feat');
assert('U-CRT-015', desc3.includes('Implementation phase'), 'Do phase description');

const desc4 = mod.generatePdcaTaskDescription('check', 'feat');
assert('U-CRT-016', desc4.includes('Verification phase'), 'Check phase description');

const desc5 = mod.generatePdcaTaskDescription('act', 'feat');
assert('U-CRT-017', desc5.includes('Improvement phase'), 'Act phase description');

const desc6 = mod.generatePdcaTaskDescription('report', 'feat');
assert('U-CRT-018', desc6.includes('Reporting phase'), 'Report phase description');

// --- getPdcaTaskMetadata ---
const meta1 = mod.getPdcaTaskMetadata('plan', 'my-feature');
assert('U-CRT-019', meta1.pdcaPhase === 'plan', 'Metadata phase');
assert('U-CRT-020', meta1.feature === 'my-feature', 'Metadata feature');
assert('U-CRT-021', meta1.level === 'Dynamic', 'Default level is Dynamic');
assert('U-CRT-022', typeof meta1.createdAt === 'string', 'createdAt is ISO string');
assert('U-CRT-023', meta1.pdcaOrder === phaseMod.getPhaseNumber('plan'), 'pdcaOrder matches getPhaseNumber');

const meta2 = mod.getPdcaTaskMetadata('design', 'feat', { level: 'Enterprise' });
assert('U-CRT-024', meta2.level === 'Enterprise', 'Custom level from options');

// --- generateTaskGuidance ---
const guide1 = mod.generateTaskGuidance('plan', 'auth');
assert('U-CRT-025', guide1.includes('Phase: plan'), 'Guidance contains phase');
assert('U-CRT-026', guide1.includes('Feature: auth'), 'Guidance contains feature');
assert('U-CRT-027', guide1.includes('plan document'), 'Plan guidance text');

const guide2 = mod.generateTaskGuidance('design', 'auth', 'plan');
assert('U-CRT-028', guide2.includes('Blocked by: plan'), 'BlockedBy included');

const guide3 = mod.generateTaskGuidance('do', 'feat');
assert('U-CRT-029', guide3.includes('Implement'), 'Do phase guidance');

console.log(`\n${'='.repeat(50)}`);
console.log(`creator.test.js: ${passed}/${total} PASS, ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
