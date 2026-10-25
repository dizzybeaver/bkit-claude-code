#!/usr/bin/env node
'use strict';
/**
 * Regression tests for br047: the unified-write-post.js PostToolUse template
 * scanner warned "Missing required sections" on COMPLIANT writes. Hypothesis
 * from the field report was a stale/pre-write content snapshot. These tests pin
 * the actual source of truth: the scanner must read POST-WRITE DISK BYTES
 * (scripts/unified-write-post.js:196, fs.readFileSync(filePath)) — never the
 * tool_input.content payload — so a compliant file on disk cannot warn even
 * when the payload carries deficient content, and a deficient file on disk
 * warns even when the payload carries compliant content.
 *
 * Runs the REAL hook script as a subprocess with a /tmp fixture project
 * (CLAUDE_PROJECT_DIR pointed at the fixture, so no live .bkit is touched).
 * Design Ref: §2 module-1
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { assert, summary, reset } = require('../helpers/assert');
const { validateDocument } = require('../../lib/pdca/template-validator');

reset();

const REPO = path.resolve(__dirname, '../..');
const HOOK = path.join(REPO, 'scripts', 'unified-write-post.js');
const WARNING_MARK = 'Missing required sections';

// All 'plan' template sections, verbatim from REQUIRED_SECTIONS (template-validator).
const PLAN_SECTIONS = [
  'Executive Summary', 'Overview', 'Scope', 'Requirements', 'Success Criteria',
  'Risks and Mitigation', 'Architecture Considerations', 'Convention Prerequisites',
  'Next Steps', 'Version History'
];

// Careful: must NOT contain any isPlanPlus() marker (Plan-Plus, Intent Discovery, ...).
const compliantPlan = [
  '# Feature Plan',
  ...PLAN_SECTIONS.map((s) => `## ${s}`),
  '',
  'Body text under each section.'
].join('\n');

// Genuinely deficient: drops Success Criteria entirely.
const deficientPlan = [
  '# Feature Plan',
  ...PLAN_SECTIONS.filter((s) => s !== 'Success Criteria').map((s) => `## ${s}`)
].join('\n');

/**
 * Fire the real hook script against a fixture project in /tmp.
 * @param {string} docPathOnDisk - absolute path of the .plan.md file on disk
 * @param {string} diskContent - what is actually written to that path
 * @param {string} payloadContent - the tool_input.content carried by the hook payload
 * @returns {{stdout: string, stderr: string, status: number}}
 */
function runHook(docPathOnDisk, diskContent, payloadContent) {
  fs.writeFileSync(docPathOnDisk, diskContent, 'utf8');

  const payload = JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: docPathOnDisk, content: payloadContent }
  });

  const res = spawnSync(process.execPath, [HOOK], {
    input: payload,
    encoding: 'utf8',
    timeout: 20000,
    cwd: REPO,
    env: Object.assign({}, process.env, {
      CLAUDE_PROJECT_DIR: path.dirname(path.dirname(docPathOnDisk)),
      BKIT_DEBUG: 'false'
    })
  });
  return { stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

console.log('\n=== scanner-br047.test.js (5 TC) ===\n');

// Fixture project: /tmp/bkit-br047-XXXX/docs/01-plan/feature.plan.md
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-br047-'));
const planDir = path.join(tmpRoot, 'docs', '01-plan');
fs.mkdirSync(planDir, { recursive: true });
const planPath = path.join(planDir, 'feature.plan.md');

try {
  // br047-1 (baseline true-positive guard, unit level): validator accepts the
  // fixture content as a complete 'plan' document.
  const unit = validateDocument(planPath, compliantPlan);
  assert('br047-1',
    unit.valid === true && unit.missing.length === 0 && unit.type === 'plan',
    'unit: compliant plan fixture validates clean (type=plan, 0 missing)');

  // br047-2 (the reported symptom): fully compliant file on disk, compliant
  // payload — the hook must NOT emit the missing-sections warning.
  const r2 = runHook(planPath, compliantPlan, compliantPlan);
  assert('br047-2',
    r2.status === 0 && !r2.stdout.includes(WARNING_MARK),
    'compliant doc on disk → no "Missing required sections" warning');

  // br047-3 (pins the disk-read source of truth): disk compliant, but the
  // payload content is the DEFICIENT draft (a stale pre-write snapshot).
  // A scanner reading tool_input.content would false-warn here (the br047
  // hypothesis); a post-write disk read must not.
  const r3 = runHook(planPath, compliantPlan, deficientPlan);
  assert('br047-3',
    r3.status === 0 && !r3.stdout.includes(WARNING_MARK),
    'disk compliant + payload stale/deficient → no warning (scanner reads disk, not tool_input.content)');

  // br047-4 (true test, other direction): file on disk genuinely missing
  // 'Success Criteria' → the warning DOES fire and names the section.
  const r4 = runHook(planPath, deficientPlan, deficientPlan);
  assert('br047-4',
    r4.status === 0 && r4.stdout.includes(WARNING_MARK)
      && r4.stdout.includes('Success Criteria'),
    'disk doc missing Success Criteria → warning fires naming the section');

  // br047-5 (reverse pin of the source): disk deficient, payload carries the
  // COMPLIANT content. Warning must still fire — proving the scan is anchored
  // on post-write disk bytes, not on the payload.
  const r5 = runHook(planPath, deficientPlan, compliantPlan);
  assert('br047-5',
    r5.status === 0 && r5.stdout.includes(WARNING_MARK),
    'disk deficient + payload compliant → warning still fires (disk is the source)');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

summary('scanner br047 Regression');
