#!/usr/bin/env node
'use strict';

/**
 * Contract Test: Hook Output Schema
 *
 * Validates that hook scripts produce output matching CC expectations.
 * Uses test/helpers/hook-runner.js to execute hooks and verify output structure.
 */

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

let runHook;
try {
  ({ runHook } = require(path.join(ROOT, 'test/helpers/hook-runner.js')));
} catch (e) {
  console.error('Cannot load hook-runner.js:', e.message);
  process.exit(1);
}

let passed = 0, failed = 0, skipped = 0, total = 0;

function test(id, desc, fn) {
  total++;
  try { fn(); passed++; } catch (e) {
    if (e.message && e.message.includes('SKIP')) { skipped++; console.log(`  SKIP ${id}: ${desc}`); }
    else { failed++; console.error(`  FAIL ${id}: ${desc}\n    ${e.message}`); }
  }
}

console.log('\n=== Hook Output Schema Contract Tests ===\n');

// ---------------------------------------------------------------------------
// T01-T03: PreToolUse:Write|Edit output
// ---------------------------------------------------------------------------

test('HOS-01', 'PreToolUse:Write returns valid output (exit 0, 1, or 2)', () => {
  const result = runHook('scripts/pre-write.js', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/test-bkit-output.js', content: '// test' },
  }, { timeout: 5000 });
  // Exit 0 = allow (no output or JSON), exit 1 = internal error (graceful), exit 2 = block
  assert.ok([0, 1, 2].includes(result.exitCode), `Unexpected exit code: ${result.exitCode}`);
  if (typeof result.stdout === 'object' && result.stdout !== null && result.stdout.decision) {
    assert.ok(['allow', 'block', 'approve'].includes(result.stdout.decision),
      `Invalid decision: ${result.stdout.decision}`);
  }
});

test('HOS-02', 'PreToolUse:Edit returns valid output format', () => {
  const result = runHook('scripts/pre-write.js', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/test.js', old_string: 'a', new_string: 'b' },
  }, { timeout: 5000 });
  assert.ok([0, 1, 2].includes(result.exitCode), `Unexpected exit code: ${result.exitCode}`);
});

test('HOS-03', 'PreToolUse:Bash returns valid output format', () => {
  const result = runHook('scripts/unified-bash-pre.js', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0 || result.exitCode === 2, `Unexpected exit code: ${result.exitCode}`);
  if (typeof result.stdout === 'object' && result.stdout !== null && result.stdout.decision) {
    assert.ok(['allow', 'block', 'approve'].includes(result.stdout.decision),
      `Invalid decision: ${result.stdout.decision}`);
  }
});

// ---------------------------------------------------------------------------
// T04-T05: UserPromptSubmit output
// ---------------------------------------------------------------------------

test('HOS-04', 'UserPromptSubmit returns valid output (description or additionalContext)', () => {
  const result = runHook('scripts/user-prompt-handler.js', {
    hook_event_name: 'UserPromptSubmit',
    user_prompt: 'bkit help',
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0, `Unexpected exit code: ${result.exitCode}`);
  // Output can be empty, or JSON with description/additionalContext
  if (typeof result.stdout === 'object' && result.stdout !== null) {
    const keys = Object.keys(result.stdout);
    if (keys.length > 0) {
      const validKeys = ['description', 'additionalContext', 'suppressOriginalPrompt'];
      const hasValidKey = keys.some(k => validKeys.includes(k));
      assert.ok(hasValidKey, `Unexpected output keys: ${keys.join(', ')}`);
    }
  }
});

test('HOS-05', 'UserPromptSubmit with empty prompt returns exit 0', () => {
  const result = runHook('scripts/user-prompt-handler.js', {
    hook_event_name: 'UserPromptSubmit',
    user_prompt: '',
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
});

// ---------------------------------------------------------------------------
// T06-T07: Stop output
// ---------------------------------------------------------------------------

test('HOS-06', 'Stop hook returns exit 0 (may have empty or JSON output)', () => {
  const result = runHook('scripts/unified-stop.js', {
    hook_event_name: 'Stop',
    stop_reason: 'end_turn',
  }, { timeout: 10000 });
  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  if (typeof result.stdout === 'object' && result.stdout !== null && result.stdout.description) {
    assert.ok(typeof result.stdout.description === 'string', 'description must be string');
  }
});

test('HOS-07', 'StopFailure hook returns exit 0', () => {
  const result = runHook('scripts/stop-failure-handler.js', {
    hook_event_name: 'StopFailure',
    error: 'test error',
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
});

// ---------------------------------------------------------------------------
// T08-T09: PostToolUse output
// ---------------------------------------------------------------------------

test('HOS-08', 'PostToolUse:Write returns exit 0', () => {
  const result = runHook('scripts/unified-write-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/test-bkit.js', content: '// test' },
    tool_result: 'File written',
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
});

test('HOS-09', 'PostToolUse:Bash returns exit 0', () => {
  const result = runHook('scripts/unified-bash-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
    tool_result: 'hello\n',
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
});

// ---------------------------------------------------------------------------
// T10: Hook output does not exceed 50K
// ---------------------------------------------------------------------------

test('HOS-10', 'Hook output stays under 50K characters', () => {
  const result = runHook('scripts/unified-stop.js', {
    hook_event_name: 'Stop',
    stop_reason: 'end_turn',
  }, { timeout: 10000 });
  const outputStr = typeof result.stdout === 'string' ? result.stdout : JSON.stringify(result.stdout);
  assert.ok(outputStr.length < 50000, `Output too large: ${outputStr.length} chars`);
});

// ---------------------------------------------------------------------------
// T11: Hook completes within timeout
// ---------------------------------------------------------------------------

test('HOS-11', 'SessionStart hook completes within 5s timeout', () => {
  const result = runHook('hooks/session-start.js', {
    hook_event_name: 'SessionStart',
  }, { timeout: 5000 });
  assert.ok(result.duration < 5000, `Took too long: ${result.duration}ms`);
});

// ---------------------------------------------------------------------------
// T12: PostToolUse:Skill returns exit 0
// ---------------------------------------------------------------------------

test('HOS-12', 'PostToolUse:Skill returns exit 0', () => {
  const result = runHook('scripts/skill-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'pdca', args: 'status' },
    tool_result: 'Skill completed',
  }, { timeout: 5000 });
  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
});

// ---------------------------------------------------------------------------
// HOS-13 ~ HOS-17: stale-replay-fix-1029 — event-ledger envelopes and
// resolution announcements (design §8.1 contract rows)
//
// Pattern: HOS-08 subprocess style (runHook with stdin JSON), extended with
// an isolated CLAUDE_PLUGIN_DATA / CLAUDE_PROJECT_DIR so the ledger file
// (learnings/hook-events.json) is test-owned. MUTATION CHECKS: removing the
// envelope emission fails HOS-13; removing the resolve announcement fails
// HOS-14/HOS-16; breaking the single-payload invariant fails HOS-15;
// removing the quiet-path no-op fails HOS-17 (br010 regression).
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');

const CHAIN_SESSION = 'hos-evt-session';
const LEDGER_FILE = path.join('learnings', 'hook-events.json');

// Temp dirs are tracked and cleaned synchronously on process exit — the
// file's test() wrapper (above) invokes cases without a `t` argument, so
// node:test's t.after is unavailable here.
const HOS_TEMP_DIRS = [];
process.on('exit', () => {
  for (const dir of HOS_TEMP_DIRS) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  }
});

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-hos-proj-'));
  HOS_TEMP_DIRS.push(dir);
  return dir;
}

function hookEnv(projectDir, pluginData) {
  return {
    CLAUDE_PLUGIN_DATA: pluginData,
    CLAUDE_PROJECT_DIR: projectDir,
    CLAUDE_CODE_SESSION_ID: CHAIN_SESSION,
  };
}

function readLedger(pluginData) {
  const file = path.join(pluginData, LEDGER_FILE);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function writeLedger(pluginData, rows) {
  const file = path.join(pluginData, LEDGER_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}

// Plan-type REQUIRED_SECTIONS (lib/pdca/template-validator.js) — a valid
// plan doc carries all ten; an invalid one omits at least one.
const PLAN_SECTIONS = [
  'Executive Summary', 'Overview', 'Scope', 'Requirements', 'Success Criteria',
  'Risks and Mitigation', 'Architecture Considerations', 'Convention Prerequisites',
  'Next Steps', 'Version History',
];

function planDoc(sections) {
  return '# Test Feature Plan\n\n' +
    sections.map(s => `## ${s}\n\nContent for ${s}.\n`).join('\n');
}

// HOS-13: write of a plan doc missing a section -> warning carries the
// [bkit:evt:tpl-...] envelope and the ledger records an open tpl row.
test('HOS-13', 'plan doc missing a section -> additionalContext carries [bkit:evt:tpl-', () => {
  const projectDir = makeTempProject();
  const pluginData = makeTempProject();
  fs.mkdirSync(path.join(projectDir, 'docs', '01-plan', 'features'), { recursive: true });
  const docPath = path.join(projectDir, 'docs', '01-plan', 'features', 'hos13.plan.md');
  fs.writeFileSync(docPath, planDoc(PLAN_SECTIONS.slice(2))); // missing first two sections

  const result = runHook('scripts/unified-write-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: docPath },
    tool_response: 'File written',
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });

  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  assert.ok(result.stdout && typeof result.stdout === 'object',
    'exactly one JSON payload on stdout');
  const ctx = result.stdout.hookSpecificOutput && result.stdout.hookSpecificOutput.additionalContext;
  assert.ok(typeof ctx === 'string' && ctx.includes('[bkit:evt:tpl-'),
    `warning carries the event envelope, got: ${String(ctx).slice(0, 200)}`);

  const rows = readLedger(pluginData);
  assert.ok(rows.length >= 1, 'ledger records the event');
  const open = rows.find(r => r.family === 'tpl' && r.resolvedAt === null);
  assert.ok(open, 'an open tpl row exists');
  assert.equal(open.target, docPath, 'row targets the written file');
  assert.ok(ctx.includes(`[bkit:evt:${open.id}]`), 'envelope id matches the ledger row id');
});

// HOS-14: rewrite of the same doc with ALL sections -> RESOLVED announcement
// naming the superseded id, and the ledger row flips to resolved.
test('HOS-14', 'valid rewrite -> RESOLVED line emitted and ledger row resolved', () => {
  const projectDir = makeTempProject();
  const pluginData = makeTempProject();
  fs.mkdirSync(path.join(projectDir, 'docs', '01-plan', 'features'), { recursive: true });
  const docPath = path.join(projectDir, 'docs', '01-plan', 'features', 'hos14.plan.md');

  // Step 1: invalid write opens the event.
  fs.writeFileSync(docPath, planDoc(PLAN_SECTIONS.slice(1)));
  runHook('scripts/unified-write-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: docPath },
    tool_response: 'File written',
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });

  const openRows = readLedger(pluginData).filter(r => r.family === 'tpl' && r.resolvedAt === null);
  assert.ok(openRows.length >= 1, 'step 1 opened a tpl event');
  const openId = openRows[0].id;

  // Step 2: corrective rewrite with all sections present.
  fs.writeFileSync(docPath, planDoc(PLAN_SECTIONS));
  const result = runHook('scripts/unified-write-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: docPath },
    tool_response: 'File written',
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });

  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  const out = JSON.stringify(result.stdout);
  assert.ok(out.includes('RESOLVED'), `pass path announces resolution, got: ${out.slice(0, 200)}`);
  assert.ok(out.includes(openId), `RESOLVED names the superseded id ${openId}`);

  const row = readLedger(pluginData).find(r => r.id === openId);
  assert.ok(row, 'ledger row still present');
  assert.ok(row.resolvedAt > 0, `row resolvedAt set (got ${row.resolvedAt})`);
});

// HOS-15: single-payload invariant (design §6.2) — both the warning path
// and the resolve path emit AT MOST one stdout JSON payload. runHook
// JSON.parses stdout; a second payload would break the parse and leave a
// raw string, failing the object-type assertion.
test('HOS-15', 'exactly one JSON payload on stdout in warning AND resolve cases', () => {
  const projectDir = makeTempProject();
  const pluginData = makeTempProject();
  fs.mkdirSync(path.join(projectDir, 'docs', '01-plan', 'features'), { recursive: true });
  const docPath = path.join(projectDir, 'docs', '01-plan', 'features', 'hos15.plan.md');

  fs.writeFileSync(docPath, planDoc(PLAN_SECTIONS.slice(3)));
  const warn = runHook('scripts/unified-write-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: docPath },
    tool_response: 'File written',
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });
  assert.ok(typeof warn.stdout === 'object',
    `warning path: single JSON payload (got raw: ${typeof warn.stdout})`);

  fs.writeFileSync(docPath, planDoc(PLAN_SECTIONS));
  const resolve = runHook('scripts/unified-write-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: docPath },
    tool_response: 'File written',
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });
  assert.ok(typeof resolve.stdout === 'object',
    `resolve path: single JSON payload (got raw: ${typeof resolve.stdout})`);
});

// HOS-16: bash-post exit-0 with open 'fail' rows -> RESOLVED announcement
// and rows flipped to resolved.
test('HOS-16', 'bash exit-0 with open fail rows -> RESOLVED emitted, rows resolved', () => {
  const projectDir = makeTempProject();
  const pluginData = makeTempProject();
  writeLedger(pluginData, [{
    id: 'fail-20261029T130000-abc123',
    family: 'fail',
    tool: 'Bash',
    target: 'npm test',
    detail: 'exit code 1',
    ts: '2026-10-29T13:00:00.000Z',
    session: CHAIN_SESSION,
    expiresAt: Date.now() + 3600_000,
    resolvedAt: null,
  }]);

  const result = runHook('scripts/unified-bash-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { exit: 0 },
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });

  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  const out = JSON.stringify(result.stdout);
  assert.ok(out.includes('RESOLVED'), `exit-0 announces resolution, got: ${out.slice(0, 200)}`);
  assert.ok(out.includes('fail-20261029T130000-abc123'), 'RESOLVED names the superseded id');

  const row = readLedger(pluginData).find(r => r.id === 'fail-20261029T130000-abc123');
  assert.ok(row && row.resolvedAt > 0, 'seeded fail row resolved');
});

// HOS-17: bash-post exit-0 with NO open rows stays quiet (br010: quiet
// paths stay quiet). MUTATION CHECK: an unconditional RESOLVED emission
// fails this case.
test('HOS-17', 'bash exit-0 with no open rows -> no RESOLVED announcement (quiet)', () => {
  const projectDir = makeTempProject();
  const pluginData = makeTempProject();

  const result = runHook('scripts/unified-bash-post.js', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
    tool_response: { exit: 0 },
  }, { env: hookEnv(projectDir, pluginData), cwd: projectDir, timeout: 10000 });

  assert.ok(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  const out = typeof result.stdout === 'string' ? result.stdout : JSON.stringify(result.stdout);
  assert.ok(!out.includes('RESOLVED'), 'no RESOLVED text when count=0');
  const ctx = result.stdout && result.stdout.hookSpecificOutput &&
    result.stdout.hookSpecificOutput.additionalContext;
  assert.ok(!ctx, 'no additionalContext content when count=0');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n--- Results: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped ---`);
if (failed > 0) process.exit(1);
