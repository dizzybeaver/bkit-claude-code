'use strict';
/**
 * br160 — quoted interpreter payloads must not hide live-registry WRITES from
 * G-019 (stripInertQuotedDeletes blanking fix). Same file scope as
 * detector-br156.test.js (module-3 DETECTOR).
 *
 * Tension held: the br148 exemptions (delete-prose / pure-read payloads keep
 * their inert literals blanked) must keep passing — BR160-03 asserts exactly
 * the readexempt ALLOW vector.
 * console.assert based harness | no external dependencies
 */

let mod;
try {
  mod = require('../../lib/control/destructive-detector');
} catch (e) {
  console.error('Module load failed:', e.message);
  process.exit(1);
}

let passed = 0, failed = 0, total = 0;
const failures = [];

function assert(id, condition, message) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${id} - ${message}`); }
  else { failed++; failures.push({ id, message }); console.error(`  FAIL: ${id} - ${message}`); }
}

// Runtime-assembled broker tokens (never contiguous in this payload).
const S = '.bkit/' + 'state/pdca-' + 'status.json';

console.log('\n=== detector-br160.test.js ===\n');

function g019(command) {
  const r = mod.detect('Bash', command);
  return r.rules.find((x) => x.id === 'G-019') || null;
}

// --- The br160 repro vectors (readexempt DENY rows that escaped) ---

const t1 = g019(`node -e "require('fs').writeFileSync('${S}','{}')"`);
assert('BR160-01a', t1 !== null, 'precondition: quoted writeFileSync payload MATCHES G-019');
assert('BR160-01b',
  t1 !== null && t1.severity === 'critical' && t1.action === 'deny',
  'node -e writeFileSync on live registry -> critical deny');

const t2 = g019(`python3 -c "open('${S}','w')"`);
assert('BR160-02a', t2 !== null, 'precondition: quoted python open-w payload MATCHES G-019');
assert('BR160-02b',
  t2 !== null && t2.severity === 'critical' && t2.action === 'deny',
  'python3 -c open(live, w) -> critical deny');

// --- More write-shaped payloads stay visible ---

const t3 = g019(`node -e "require('fs').appendFileSync('${S}','x')"`);
assert('BR160-03',
  t3 !== null && t3.severity === 'critical' && t3.action === 'deny',
  'appendFileSync payload -> critical deny');

// no `;` in the payload: G-019's 4000-char window excludes ; — a semicolon-
// separated payload still escapes (known boundary, br102 pattern family)
const t4 = g019(`python3 -c "__import__('shutil').copy('${S}','/tmp/x')"`);
assert('BR160-04',
  t4 !== null && t4.severity === 'critical' && t4.action === 'deny',
  'shutil.copy FROM live without sandbox claim -> critical (unsanctioned)');

// br160+br156 composition: the SAME payload under a /tmp sandbox claim grades
// down to advisory — the copy source is vetted benign (shutil.copy first arg)
const t5 = g019(`CLAUDE_PROJECT_DIR=/tmp/probe-root python3 -c "__import__('shutil').copy('${S}','/tmp/probe-root/x')"`);
assert('BR160-05',
  t5 !== null && t5.severity !== 'critical' && t5.action === 'ask',
  'sandboxed shutil.copy from live -> advisory (br156 downgrade composes)');

// --- The br148 exemptions must keep passing (the tension) ---

// pure-read payload keeps its literals blanked -> no G-019 match at all
const t6 = g019(`node -e "const s=require('fs').readFileSync('${S}','utf8');console.log(s.length)"`);
assert('BR160-06', t6 === null, 'br148 exemption holds: readFileSync payload stays clean');

// delete-prose in data (the original br148 FP) stays blanked
const t7 = g019(`node -e "const t='shutil.rmtree'"`);
assert('BR160-07', t7 === null, 'br148 exemption holds: delete-prose string stays blank');

// inert echo DATA keeps its blanking
const t8 = g019(`echo 'rm -rf .bkit/state/thing'`);
assert('BR160-08', t8 === null, 'br148 exemption holds: echo delete-prose stays blank');

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed\n`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  ${f.id}: ${f.message}`);
  process.exit(1);
}
