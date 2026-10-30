#!/usr/bin/env node
'use strict';

/*
 * gap-detector-unmeasured.test.js
 *
 * A gap analysis that reports no readable percentage is unmeasured, never a
 * measured 0%. A fabricated 0 would travel everywhere the real number does
 * (pdca-status matchRate, the M1 series, the audit trail, the ITERATE
 * transition) and looks like diligence. `parseGapReport` is the single parser
 * scripts/subagent-stop-handler.js uses; it returns null for anything it cannot
 * read, and the handler records nothing for null.
 */

const assert = require('node:assert');
const { parseGapReport, isMeasured } = require('../../lib/quality/match-rate');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { failures.push(`${name}: ${e.message}`); }
}

const report = (target, rate) => [
  '# Gap Analysis',
  `- Analysis Target: ${target}`,
  '',
  '| Category | Score |',
  '|----------|:-----:|',
  `| Overall Match Rate | ${rate}% |`,
].join('\n');

test('GDU-1 a report with no percentage is unmeasured (null), not 0', () => {
  assert.strictEqual(parseGapReport('gap analysis for feature: demo finished'), null);
});

test('GDU-2 a rate without the Analysis Target line is unmeasured', () => {
  assert.strictEqual(parseGapReport('| Overall Match Rate | 93% |'), null);
});

test('GDU-3 conflicting Overall Match Rate rows are unmeasured', () => {
  assert.strictEqual(parseGapReport(`${report('demo', 93)}\n| Overall Match Rate | 41% |`), null);
});

test('GDU-4 an out-of-range rate is unmeasured', () => {
  assert.strictEqual(parseGapReport(report('demo', 140)), null);
});

test('GDU-5 a real measurement flows through', () => {
  assert.deepStrictEqual(parseGapReport(report('demo', 93)), { feature: 'demo', matchRate: 93 });
});

test('GDU-6 a measured failure is reported as its number', () => {
  const r = parseGapReport(report('demo', 41));
  assert.strictEqual(r.matchRate, 41);
  assert.ok(isMeasured(r.matchRate));
});

if (failures.length > 0) {
  console.error(`\n✗ gap-detector-unmeasured: ${failures.length} failing assertion(s)`);
  for (const f of failures) console.error(`    ✗ ${f}`);
  console.error(`\npass:${pass} fail:${failures.length} skip:0`);
  process.exit(1);
}
console.log(`✓ gap-detector-unmeasured — pass:${pass} fail:0 skip:0`);
