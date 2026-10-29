/**
 * tool-failure-classification.test.js — classifyFailure/extractExitCode unit suite
 *
 * Covers docs/02-design/features/stale-replay-fix-1029.design.en.md §8.1
 * (unit row for tool-failure-handler.js): classification arms including the
 * two verified silent arms (rb006 success_suppressed, br878 part 2
 * benign_expected_failure), the rb033/FR-01 self-identifying exit_nonzero
 * line, and extractExitCode from both the error string and tool_response.
 *
 * HARNESS NOTE — which approach was used and why:
 * scripts/tool-failure-handler.js reads stdin at top level
 * (readStdinSync at :20), so a plain `require` from the test runner is
 * UNSAFE (it would consume the runner's fd 0). The classification logic is
 * therefore extracted as source text: the two function declarations are
 * located by stable `function <name>(` anchors, sliced on balanced braces,
 * and rebuilt via `new Function` — no regex on code, no eval of the whole
 * file. classifyFailure's body calls extractExitCode, so the extracted
 * extractExitCode is passed in as the wrapper's sole parameter.
 *
 * The env-gated export path (BKIT_EXPORT_FOR_TESTS=1, module-1 contract) is
 * asserted separately in a child process with a piped stdin — the child
 * requires the script with the env set and reports the export types via a
 * temp result file (the handler's own stdout stays unparsed).
 *
 * MUTATION CHECKS (true-tests requirement):
 *   - Removing the success_suppressed silent arm (TF-03) or the
 *     benign_expected_failure silent arm (TF-04) turns those cases RED:
 *     recovery would become non-empty and emit stale replay context.
 *   - Dropping tool/exit-code/timestamp/command-head from the
 *     exit_nonzero recovery line turns TF-01 RED (FR-01/br878 contract).
 *   - TF-12 (FR-01 envelope, Act-1 gap 1): restricting the envelope to
 *     exit_nonzero turns TF-12 RED — the timeout recovery line would be
 *     emitted without its [bkit:evt:<id>] suffix.
 *
 * @module test/unit/tool-failure-classification.test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'tool-failure-handler.js');

// ============================================================
// Function-extraction harness
// ============================================================

/** Slice a top-level `function <name>(...) {...}` declaration out of source. */
function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start !== -1, `function ${name}() found in tool-failure-handler.js`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let i = bodyStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0, `balanced braces for ${name}`);
  return source.slice(start, i + 1);
}

const handlerSource = fs.readFileSync(SCRIPT, 'utf8');
const extractExitCode = new Function(
  'return (' + extractFunctionSource(handlerSource, 'extractExitCode') + ')'
)();
const classifyFailure = new Function(
  'extractExitCode',
  'return (' + extractFunctionSource(handlerSource, 'classifyFailure') + ')'
)(extractExitCode);

// ============================================================
// TF-01: exit_nonzero — the self-identifying recovery line (rb033/FR-01)
// ============================================================
test('TF-01: exit_nonzero recovery carries tool, exit code, ISO timestamp, command head', () => {
  const result = classifyFailure(
    'Bash',
    'Command failed with exit code 2',
    { command: 'npm run test -- --filter slow-suite' },
    null
  );
  assert.equal(result.pattern, 'exit_nonzero');
  assert.equal(result.severity, 'low');
  assert.ok(result.recovery.includes('Bash'), 'recovery names the tool');
  assert.ok(result.recovery.includes('2'), 'recovery names the exit code');
  assert.match(result.recovery, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    'recovery carries an ISO timestamp');
  assert.ok(result.recovery.includes('npm run test'), 'recovery carries the command head');
  assert.ok(result.recovery.length < 300, 'command head truncated (rb033 <=60 chars)');
});

// ============================================================
// TF-02: exit_nonzero with unknown exit code still classifies
// ============================================================
test('TF-02: exit_nonzero without a parseable code reports exit unknown', () => {
  const result = classifyFailure('Bash', 'process exited non-zero', { command: 'ls' }, null);
  assert.equal(result.pattern, 'exit_nonzero');
  assert.ok(result.recovery.includes('unknown'), 'unparseable code reported as unknown');
});

// ============================================================
// TF-03: success_suppressed — silent arm 1 (rb006). MUTATION CHECK:
// removing this arm makes recovery non-empty and fails this case.
// ============================================================
test('TF-03: verified exit-0 (success_suppressed) emits empty recovery', () => {
  const fromString = classifyFailure('Bash', 'exit code 0', { command: 'echo ok' }, null);
  assert.equal(fromString.pattern, 'success_suppressed');
  assert.equal(fromString.recovery, '', 'silent arm: no recovery text (error-string source)');

  const fromResponse = classifyFailure('Bash', '', { command: 'echo ok' }, { exit: 0 });
  assert.equal(fromResponse.pattern, 'success_suppressed');
  assert.equal(fromResponse.recovery, '', 'silent arm: no recovery text (tool_response source)');
});

// ============================================================
// TF-04: benign_expected_failure — silent arm 2 (br878 part 2).
// MUTATION CHECK: removing this arm makes recovery non-empty and
// fails this case.
// ============================================================
test('TF-04: exit-code-only residue (benign_expected_failure) emits empty recovery', () => {
  const result = classifyFailure('Bash', 'exit code 1', { command: 'lint probe' }, null);
  assert.equal(result.pattern, 'benign_expected_failure');
  assert.equal(result.recovery, '', 'silent arm: no recovery text');
  assert.equal(result.severity, 'low');
});

// ============================================================
// TF-05: residue beyond the exit code is NOT benign — real failure text
// must still reach exit_nonzero
// ============================================================
test('TF-05: exit code plus real error text classifies exit_nonzero, not benign', () => {
  const result = classifyFailure(
    'Bash',
    'exit code 1: 3 tests failed',
    { command: 'npm test' },
    null
  );
  assert.equal(result.pattern, 'exit_nonzero');
  assert.notEqual(result.recovery, '', 'real failure text keeps the recovery line');
});

// ============================================================
// TF-06: timeout arm
// ============================================================
test('TF-06: timeout errors arm the timeout pattern', () => {
  const result = classifyFailure('Bash', 'command timed out after 30000ms', {}, null);
  assert.equal(result.pattern, 'timeout');
  assert.equal(result.severity, 'medium');
  assert.ok(result.recovery.includes('timed out'));
});

// ============================================================
// TF-07: disk_full arm
// ============================================================
test('TF-07: disk-space errors arm the disk_full pattern', () => {
  const result = classifyFailure('Bash', 'write failed: ENOSPC: no space left on device', {}, null);
  assert.equal(result.pattern, 'disk_full');
  assert.equal(result.severity, 'high');
});

// ============================================================
// TF-08: permission_denied arm
// ============================================================
test('TF-08: permission errors arm the permission_denied pattern', () => {
  const result = classifyFailure('Write', 'EACCES: permission denied, open /etc/hosts', {}, null);
  assert.equal(result.pattern, 'permission_denied');
  assert.equal(result.severity, 'medium');
  assert.ok(result.recovery.includes('Permission denied'));
});

// ============================================================
// TF-09: extractExitCode — error string sources
// ============================================================
test('TF-09: extractExitCode parses "exit code N" / "exit status N" from the error string', () => {
  assert.equal(extractExitCode('Command failed with exit code 3', null), 3);
  assert.equal(extractExitCode('process exited: exit status 127', null), 127);
  assert.equal(extractExitCode('EXIT CODE 9', null), 9, 'case-insensitive');
  assert.equal(extractExitCode('no code here', null), null);
  assert.equal(extractExitCode('', null), null);
  assert.equal(extractExitCode(null, null), null);
});

// ============================================================
// TF-10: extractExitCode — tool_response sources
// ============================================================
test('TF-10: extractExitCode reads exit/exitCode from tool_response', () => {
  assert.equal(extractExitCode('', { exit: 5 }), 5);
  assert.equal(extractExitCode('', { exitCode: 7 }), 7);
  assert.equal(extractExitCode('', { exit: 'not-a-number' }), null,
    'non-numeric response code ignored');
  // error string wins when both present
  assert.equal(extractExitCode('exit code 2', { exit: 5 }), 2);
});

// ============================================================
// TF-11: the env-gated export path (module-1 contract)
// BKIT_EXPORT_FOR_TESTS=1 makes the script export classifyFailure and
// extractExitCode. Asserted in a child process (stdin piped) because the
// script reads fd 0 at top level.
// ============================================================
test('TF-11: BKIT_EXPORT_FOR_TESTS=1 exposes classifyFailure/extractExitCode exports', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-tf-export-'));
  const resultFile = path.join(tmpDir, 'export-probe.json');
  try {
    const probe = [
      'const fs = require("fs");',
      'try {',
      '  const m = require(process.argv[1]);',
      `  fs.writeFileSync(process.argv[2], JSON.stringify({ ok: true,`,
      `    classifyFailure: typeof m.classifyFailure,`,
      `    extractExitCode: typeof m.extractExitCode }));`,
      '} catch (e) {',
      `  fs.writeFileSync(process.argv[2], JSON.stringify({ ok: false, error: e.message }));`,
      '}',
    ].join('\n');

    const childEnv = { ...process.env, BKIT_EXPORT_FOR_TESTS: '1' };
    delete childEnv.CLAUDE_PLUGIN_DATA; // keep the child's side effects no-op

    execFileSync(process.execPath, ['-e', probe, SCRIPT, resultFile], {
      input: '{}', // valid stdin payload for the handler's top-level read
      env: childEnv,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    const probeResult = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    assert.ok(probeResult.ok, `child require succeeded: ${probeResult.error || ''}`);
    assert.equal(probeResult.classifyFailure, 'function',
      'classifyFailure exported under BKIT_EXPORT_FOR_TESTS=1');
    assert.equal(probeResult.extractExitCode, 'function',
      'extractExitCode exported under BKIT_EXPORT_FOR_TESTS=1');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================
// TF-12: FR-01 envelope on a NON-exit_nonzero ledgered pattern (Act-1
// gap 1) — the timeout arm opens a ledger row and its emitted recovery
// line carries [bkit:evt:<id>]. The compose site is top-level CLI code
// after the stdin read, so the source-extraction harness cannot reach
// it: this case drives the REAL handler through a child process with a
// piped stdin payload (same mechanism as TF-11) and parses the
// PostToolUseFailure outputContext JSON line.
// MUTATION CHECK: re-gating the envelope behind
// `classification.pattern === 'exit_nonzero'` turns this case RED.
// ============================================================
test('TF-12: timeout recovery line emitted through the compose site carries [bkit:evt:<id>]', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkit-tf-envelope-'));
  const pluginData = path.join(tmpDir, 'plugin-data');
  fs.mkdirSync(pluginData, { recursive: true });
  try {
    const childEnv = { ...process.env, CLAUDE_PLUGIN_DATA: pluginData };
    delete childEnv.BKIT_EXPORT_FOR_TESTS; // force the main CLI path, not the export branch

    const stdout = execFileSync(process.execPath, [SCRIPT], {
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sleep 300' },
        error: 'command timed out after 30000ms',
      }),
      env: childEnv,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // PostToolUseFailure routes through outputContext: one JSON line on
    // stdout with hookSpecificOutput.additionalContext.
    const lines = stdout.trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 1, 'handler produced an output line');
    const parsed = JSON.parse(lines[lines.length - 1]);
    const context = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;

    // Recovery TEXT unchanged apart from the suffix (Plan FR-01 wording).
    assert.ok(typeof context === 'string' && context.includes('timed out'),
      `timeout recovery text preserved: ${context}`);

    // The envelope rides the emitted line...
    const match = context.match(/\[bkit:evt:([^\]]+)\]/);
    assert.ok(match, `recovery line carries [bkit:evt:<id>] envelope: ${context}`);

    // ...and the id is a row ACTUALLY opened in the ledger file (fail family).
    const ledgerFile = path.join(pluginData, 'learnings', 'hook-events.json');
    const rows = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assert.ok(Array.isArray(rows) && rows.some((r) => r.id === match[1] && r.family === 'fail'),
      `envelope id ${match && match[1]} matches an open fail-family row in hook-events.json`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
