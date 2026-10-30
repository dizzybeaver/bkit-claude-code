'use strict';
/**
 * Regression tests for reading the agent's reported text instead of the hook envelope.
 * console.assert based | no external dependencies
 *
 * `JSON.stringify(input)` is the hook ENVELOPE (hook_event_name, session_id,
 * transcript_path, cwd), not what the agent reported. `io.readHookText` resolves
 * the agent's own text from the transcript, and the match-rate rules keep an
 * unmeasured value unmeasured instead of turning it into 0.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const io = require('../../lib/core/io');
const matchRateRules = require('../../lib/quality/match-rate');

let passed = 0, failed = 0, total = 0, skipped = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

console.log('\n=== stop-handler-extraction.test.js ===\n');

// --- The envelope carries none of the signals ---

const ENVELOPE = {
  hook_event_name: 'Stop',
  session_id: 'ab12cd34',
  transcript_path: '/home/u/.claude/projects/-home-u/ab12cd34.jsonl',
  cwd: '/home/u/project',
};
const envelopeText = JSON.stringify(ENVELOPE);

const matchRatePattern = /(Overall|Match Rate|매치율|일치율|Design Match)[^0-9]*(\d+)/i;
const completionPattern = /(완료|Complete|Completed|>= 90%|매치율.*9[0-9]%|Match Rate.*9[0-9]%|passed|성공|Successfully)/i;
const actionPattern = /pdca\s+(pm|plan|design|do|analyze|iterate|qa|report|status|next)/i;

assert('SE-001', !matchRatePattern.test(envelopeText), 'Match rate cannot be found in the envelope');
assert('SE-002', !completionPattern.test(envelopeText), 'Completion cannot be detected in the envelope');
assert('SE-003', !actionPattern.test(envelopeText), 'PDCA action cannot be found in the envelope');

// --- readHookText on a real transcript surfaces exactly those signals ---

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-extract-'));
const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
fs.writeFileSync(transcriptPath, [
  JSON.stringify({ type: 'user', message: { content: '/pdca analyze checkout-flow' } }),
  JSON.stringify({
    type: 'assistant',
    message: { content: [
      { type: 'thinking', thinking: 'Overall Match Rate: 3%' },
      { type: 'text', text: 'Gap analysis for pdca analyze checkout-flow — Overall Match Rate: 87%. 4 files modified. Completed.' },
    ] },
  }),
  '',
].join('\n'));

const resolved = io.readHookText({ ...ENVELOPE, transcript_path: transcriptPath });

assert('SE-004', matchRatePattern.test(resolved) && resolved.match(matchRatePattern)[2] === '87',
  'Match rate is extractable from the resolved text, and reads 87 not 3');
assert('SE-005', completionPattern.test(resolved), 'Completion is detectable from the resolved text');
assert('SE-006', actionPattern.test(resolved) &&
  resolved.match(actionPattern)[1].toLowerCase() === 'analyze',
  'PDCA action is extractable from the resolved text');
assert('SE-007', !/Match Rate: 3%/.test(resolved),
  'The thinking block cannot supply a competing match rate');

fs.rmSync(tmpDir, { recursive: true, force: true });

// --- Unmeasured stays unmeasured ---

assert('SE-008', matchRateRules.isMeasured(0) === true,
  'isMeasured(0) is true, so a fabricated 0 would read as a real measurement');
assert('SE-009', matchRateRules.isMeasured(null) === false,
  'null is the honest representation of unmeasured');
assert('SE-010', matchRateRules.format(null) === 'not measured',
  'format() states the absence instead of inventing a number');

// --- Summary ---
console.log(`\nResults: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.id}: ${f.message}`));
}

module.exports = { passed, failed, total, skipped, failures };
