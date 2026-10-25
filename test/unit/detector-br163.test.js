'use strict';
/**
 * br163 — `;` between write verb and broker token inside an interpreter
 * payload must not defeat G-019 (payload-level rule, design Option C).
 *
 * Family: br148/br156/br160. The br156 sandbox downgrade and br148 exemptions
 * must keep composing (guards below).
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

console.log('\n=== detector-br163.test.js ===\n');

function g019(command) {
  const r = mod.detect('Bash', command);
  return r.rules.find((x) => x.id === 'G-019') || null;
}

// --- Red vectors: `;` write payloads now match at critical ---

const t1 = g019(`python3 -c "import shutil; shutil.copy('live-x', 'live-dest/${S}')"`);
assert('BR163-01a', t1 !== null, 'precondition: python `;` copy-to-live payload MATCHES G-019');
assert('BR163-01b',
  t1 !== null && t1.severity === 'critical' && t1.action === 'deny',
  'python `;` copy with live-dest broker token -> critical deny');

const t2 = g019(`node -e "const x=1; fs.writeFileSync('${S}', d)"`);
assert('BR163-02',
  t2 !== null && t2.severity === 'critical' && t2.action === 'deny',
  'node `;` writeFileSync on live registry -> critical deny');

const t3 = g019(`node -e "const fs=require('fs'); fs.appendFileSync('${S}','x')"`);
assert('BR163-03',
  t3 !== null && t3.severity === 'critical' && t3.action === 'deny',
  'node `;` appendFileSync on live registry -> critical deny');

// --- Composition: sandbox downgrade still applies across `;` ---

const t4 = g019(`CLAUDE_PROJECT_DIR=/tmp/probe-root python3 -c "import shutil; shutil.copy('${S}', '/tmp/probe-root/x')"`);
assert('BR163-04a', t4 !== null, 'precondition: sandboxed `;` copy-from-live MATCHES G-019');
assert('BR163-04b',
  t4 !== null && t4.severity !== 'critical' && t4.action === 'ask',
  'sandboxed `;` copy-from-live -> advisory (br156 downgrade composes)');

// --- Laundering guard: sandbox claim + `;` copy INTO live stays critical ---

const t5 = g019(`CLAUDE_PROJECT_DIR=/tmp/probe-root python3 -c "import shutil; shutil.copy('/tmp/x', '${S}')"`);
assert('BR163-05',
  t5 !== null && t5.severity === 'critical' && t5.action === 'deny',
  'sandbox claim + `;` copy TO live registry -> still critical deny');

// --- Deny-bias guards: no write verb -> no new match ---

const t6 = g019(`node -e "const a=1; console.log('see ${S} docs')"`);
assert('BR163-06', t6 === null, 'read-only `;` payload, token only in prose string -> no new match');

const t7 = g019(`node -e "const t='rm -rf ${S}'; console.log(t)"`);
assert('BR163-07', t7 === null, 'quoted-delete prose with `;` -> still br148-exempt');

const t8 = g019(`node -e "const a=1; const s=require('fs').readFileSync('${S}','utf8'); console.log(s.length)"`);
assert('BR163-08', t8 === null, 'read-only `;` readFileSync payload -> no new match');

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed\n`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  ${f.id}: ${f.message}`);
  process.exit(1);
}
