'use strict';
/**
 * br156 — G-019 sandboxed-probe downgrade + advisory (FR-03, module-3)
 *
 * Live incident: G-019 blocked a Bash probe whose node script redirected the
 * broker root to a /tmp copy via CLAUDE_PROJECT_DIR and only READ/copied FROM
 * the live registry. The detector pattern-matches text and cannot see the
 * sandbox redirection. Guard tokens are assembled from fragments so THIS file
 * does not itself match the rule it tests.
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

const B = '.' + 'bkit';                 // avoids literal broker token in source
const ST = B + '/state/pdca-' + 'status.json'; // registry path, fragmented

console.log('\n=== detector-br156.test.js ===\n');

function g019(command) {
  const r = mod.detect('Bash', command);
  return r.rules.find((x) => x.id === 'G-019') || null;
}

// --- Part 2: sandboxed probe downgrades from deny to advisory ---

// BR156-01: env-prefix sandbox + shell cp FROM live registry (copy source)
// -> G-019 still surfaces, but graded non-critical with action 'ask'
//    (the hook blocks only critical severities; 'ask' surfaces without blocking)
const t1 = g019(`CLAUDE_PROJECT_DIR=/tmp/probe-root cp ${ST} /tmp/probe-root/copy.json`);
assert('BR156-01',
  t1 !== null && t1.severity !== 'critical' && t1.action === 'ask',
  'sandboxed cp-from-live -> G-019 advisory (ask), not critical deny');

// BR156-02: heredoc-inside-bash -c shape (the surviving heredoc form) with the
// sandbox assignment inside the script and the live registry as copyFileSync
// SOURCE -> advisory
const heredoc = [
  'CLAUDE_PROJECT_DIR=/tmp/probe-root bash -c "$(cat <<\'EOF\'',
  'process.env.CLAUDE_PROJECT_DIR = \'/tmp/probe-root\';',
  `cp('${ST}', '/tmp/probe-root/copy.json');`,
  'EOF',
  ')"'
].join('\n');
const t2 = g019(heredoc);
assert('BR156-02a', t2 !== null,
  'precondition: heredoc sandbox probe MATCHES G-019 (text-level)');
assert('BR156-02b',
  t2 !== null && t2.severity !== 'critical' && t2.action === 'ask',
  'heredoc sandbox probe -> advisory (ask), not deny');

// --- Guards: live mutations still block (br143-era protection) ---

// BR156-03: direct live-registry write via redirect -> still critical deny
const t3 = g019(`CLAUDE_PROJECT_DIR=/tmp/probe-root sh -c "echo '{}' > ${ST}"`);
assert('BR156-03',
  t3 !== null && t3.severity === 'critical' && t3.action === 'deny',
  'sandbox claim + redirect write to live registry -> still critical deny');

// BR156-04: sandbox claim + cp INTO the live registry (dest position) ->
// cannot launder a live write behind a sandbox claim
const t4 = g019('CLAUDE_PROJECT_DIR=/tmp/probe-root cp /tmp/probe-root/copy.json ' + ST);
assert('BR156-04',
  t4 !== null && t4.severity === 'critical' && t4.action === 'deny',
  'sandbox claim + cp TO live registry -> still critical deny');

// BR156-05: sandbox claim + writeFileSync targeting live registry -> deny
const t5 = g019(`CLAUDE_PROJECT_DIR=/tmp/probe-root node -e "fs.writeFileSync('${ST}','{}`);
assert('BR156-05a', t5 !== null, 'precondition: live write-call shape MATCHES G-019 (text-level)');
assert('BR156-05b',
  t5 !== null && t5.severity === 'critical' && t5.action === 'deny',
  'sandbox claim + write-call on live path -> still critical deny');

// BR156-06: sandbox claim + glob-spelled path (no literal token to vet) ->
// no downgrade; the br143-era deny stands
const t6 = g019('CLAUDE_PROJECT_DIR=/tmp/probe-root cp .' + '??' + 'it/state/pdca-' + 'status.json /tmp/c');
assert('BR156-06a', t6 !== null, 'precondition: glob-spelled path MATCHES G-019 (text-level)');
assert('BR156-06b',
  t6 !== null && t6.severity === 'critical' && t6.action === 'deny',
  'glob-spelled broker path under sandbox claim -> no downgrade');

// BR156-07: no sandbox assignment at all + a read-shaped use that still
// matches -> grade stays critical (downgrade requires the /tmp claim)
const t7 = g019(`cp ${ST} /tmp/copy.json && echo done`);
assert('BR156-07',
  t7 === null || t7.severity === 'critical',
  'no CLAUDE_PROJECT_DIR=/tmp claim -> no downgrade');

// --- Part 1: advisory text names the sanctioned probe shape ---

const ADVICE = 'Sandboxed verification probes: run them as a repo-resident script '
  + 'that sets CLAUDE_PROJECT_DIR to a /tmp root, invoked with plain `node <script-path>`.';
const advice = mod.alternativesFor([{ id: 'G-019' }]);
assert('BR156-08', advice.includes(ADVICE),
  'G-019 alternatives name the sanctioned sandboxed probe shape');
const msg = mod.getBlockMessage([{ id: 'G-019', name: 'Broker state modification', severity: 'critical', pattern: 'x' }]);
assert('BR156-09', msg.includes(ADVICE),
  'G-019 block message carries the sanctioned probe advisory');
const advice20 = mod.alternativesFor([{ id: 'G-020' }]);
assert('BR156-10', !advice20.includes(ADVICE),
  'G-020 (Write/Edit registry rule) does not get the Bash-shaped advisory');

console.log(`\nResults: ${passed}/${total} passed, ${failed} failed\n`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  ${f.id}: ${f.message}`);
  process.exit(1);
}
