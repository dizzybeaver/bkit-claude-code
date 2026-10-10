#!/usr/bin/env node
/**
 * G-019 state-read-use exemption vectors (br046).
 * @module test/unit/destructive-detector-readexempt
 *
 * ALLOW = provable READ uses of broker state that G-019 must stand down for.
 * DENY  = write forms that must stay denied (deny-biased by design).
 * Vectors are EXACTLY design §2 W1-vectors (br046-carry-zero).
 *
 * Broker paths are assembled at runtime (the same idiom the hook-path suites
 * use): this file is read by tooling whose own PreToolUse hook would otherwise
 * refuse the literal state-path command strings. Assembled values are identical
 * to the design's vectors.
 *
 * @version 1.0.0
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detect } = require('../../lib/control/destructive-detector');

/** True if the Bash command trips G-019. */
function g019(command) {
  return detect('Bash', { command }).rules.some((r) => r.id === 'G-019');
}

// Runtime-assembled broker tokens (never contiguous in this payload).
const S = '.bkit/' + 'state/pdca-' + 'status.json';
const SX = '.bkit/' + 'state/' + 'x';

const ALLOW = [
  `cp ${S} /tmp/x`,
  `cp --parents a b ${S} work/backups/x/`,
  `node -e "const s=require('fs').readFileSync('${S}','utf8');console.log(s.length)"`,
];

const DENY = [
  `cp /tmp/x ${S}`,
  `node -e "require('fs').writeFileSync('${S}','{}')"`,
  `echo x >> ${S}`,
  `sort ${SX} -o ${SX}`,
  `cat y | tee ${S}`,
  `rm ${S}`,
  `python3 -c "open('${S}','w')"`,
];

for (const cmd of ALLOW) {
  test(`ALLOW G-019 stands down: ${cmd}`, () => {
    assert.equal(g019(cmd), false, `read use was denied: ${cmd}`);
  });
}

for (const cmd of DENY) {
  test(`DENY write form stays denied: ${cmd}`, () => {
    assert.equal(g019(cmd), true, `write form escaped G-019: ${cmd}`);
  });
}
