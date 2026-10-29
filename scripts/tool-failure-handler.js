#!/usr/bin/env node
/**
 * tool-failure-handler.js - PostToolUseFailure Hook Handler
 * Analyzes tool failures, records error patterns, and provides recovery guidance.
 *
 * Input: { tool_name, tool_input, error, is_interrupt }
 * Output: hookSpecificOutput with additionalContext (recovery guidance)
 *
 * @version 2.1.10
 * @module scripts/tool-failure-handler
 */

const fs = require('fs');
const path = require('path');
const { readStdinSync, outputAllow, outputEmpty } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const eventLedger = require('../lib/core/event-ledger');

// stale-replay-fix-1029: classifyFailure is exported for unit tests behind an
// env gate so a bare require keeps the CLI stdin behavior identical. Placed
// before the stdin read because the top-level main logic otherwise runs on
// require; classifyFailure/extractExitCode are hoisted function declarations.
if (
  typeof module !== 'undefined' &&
  module.exports !== undefined &&
  process.env.BKIT_EXPORT_FOR_TESTS === '1'
) {
  module.exports = { classifyFailure, extractExitCode };
}

let input;
try {
  input = readStdinSync();
} catch (e) {
  debugLog('ToolFailure', 'Failed to read stdin', { error: e.message });
  outputEmpty();
  process.exit(0);
}

const toolName = input.tool_name || input.toolName || 'unknown';
const toolInput = input.tool_input || input.toolInput || {};
const errorMsg = input.error || input.errorMessage || '';
const isInterrupt = input.is_interrupt || false;

// rb006: triage — record the true payload shape on the next live firing so the
// upstream exit-0 event source can be assigned blame with evidence
debugLog('ToolFailure', 'raw input (rb006 triage)', {
  toolName,
  error: String(errorMsg).slice(0, 500),
  inputKeys: Object.keys(input || {}),
  toolResponse: input.tool_response === undefined ? 'absent' : String(JSON.stringify(input.tool_response)).slice(0, 500),
});

debugLog('ToolFailure', 'Hook started', {
  toolName,
  error: String(errorMsg).substring(0, 200),
  isInterrupt,
});

// rb006: extract an explicit exit code from the failure payload (error string
// or tool_response field); returns null when no code is present — the caller
// then fail-opens to the previous substring-classification behavior
function extractExitCode(error, toolResponse) {
  const match = String(error).match(/exit (?:code|status)[:\s]*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  if (toolResponse && typeof toolResponse === 'object') {
    const code = toolResponse.exit !== undefined ? toolResponse.exit : toolResponse.exitCode;
    if (typeof code === 'number') {
      return code;
    }
  }
  return null;
}

// Step 1: Classify failure pattern
function classifyFailure(tool, error, input, toolResponse) {
  const err = String(error).toLowerCase();

  if (err.includes('permission denied') || err.includes('eacces') || err.includes('eperm')) {
    return {
      pattern: 'permission_denied',
      severity: 'medium',
      recovery: `Permission denied for ${tool}. Check file permissions or run from correct directory.`,
    };
  }

  if (err.includes('command not found') || err.includes('enoent') && tool === 'Bash') {
    const cmd = (typeof input === 'object' && input.command) ? input.command.split(' ')[0] : 'unknown';
    return {
      pattern: 'command_not_found',
      severity: 'low',
      recovery: `Command "${cmd}" not found. Check if it is installed and in PATH.`,
    };
  }

  if (err.includes('no such file') || err.includes('enoent') || err.includes('file not found')) {
    return {
      pattern: 'file_not_found',
      severity: 'low',
      recovery: `File not found. Verify the path exists before attempting ${tool}.`,
    };
  }

  // rb006: require a genuinely non-zero exit code before classifying
  // exit_nonzero — substring match alone fired on verified exit-0 commands
  const exitCode = extractExitCode(error, toolResponse);
  if (exitCode === 0) {
    return {
      pattern: 'success_suppressed',
      severity: 'low',
      recovery: '',
    };
  }

  // br878 part 2: expected-failure arm — a failure carrying ONLY an exit code
  // (no error text beyond the code itself, e.g. a lint probe reporting
  // success) is a benign expected failure, not a defect: emit nothing.
  if (exitCode !== null) {
    const residue = err
      .replace(/exit (?:code|status)[:\s]*\d+/gi, '')
      .replace(/non-zero/g, '')
      .replace(/[\s.:;-]+/g, '');
    if (residue.length === 0) {
      return {
        pattern: 'benign_expected_failure',
        severity: 'low',
        recovery: '',
      };
    }
  }

  if (err.includes('exit code') || err.includes('non-zero') || err.includes('exit status')) {
    // Plan FR-08: stale replays become self-identifying (br878/rb033) — the
    // recovery line carries tool, exit code, timestamp, and the command head
    // so a replayed recovery hint can be traced to its originating failure.
    const cmd = (typeof input === 'object' && input && input.command) ? String(input.command) : 'unknown';
    return {
      pattern: 'exit_nonzero',
      severity: 'low',
      recovery: `${tool} exit ${exitCode === null ? 'unknown' : exitCode} at ${new Date().toISOString()} for '${cmd.slice(0, 60)}' — review the error output above.`,
    };
  }

  if (err.includes('timeout') || err.includes('timed out')) {
    return {
      pattern: 'timeout',
      severity: 'medium',
      recovery: `${tool} timed out. Consider breaking into smaller operations.`,
    };
  }

  if (err.includes('disk') || err.includes('enospc') || err.includes('no space')) {
    return {
      pattern: 'disk_full',
      severity: 'high',
      recovery: 'Disk space critically low. Free up space before continuing.',
    };
  }

  return {
    pattern: 'unknown',
    severity: 'low',
    recovery: `${tool} failed unexpectedly. Review the error message for details.`,
  };
}

// rb006: pass the raw tool_response through so the exit-0 guard can see the code
const toolResponse = input.tool_response || input.toolResponse || null;
const classification = classifyFailure(toolName, errorMsg, toolInput, toolResponse);

// Design Ref: §11.2 Module-1b — self-identifying failure envelope
// FR-04: ledger rows only for actionable patterns; the two verified silent
// arms (success_suppressed, benign_expected_failure) never open a row.
const LEDGER_PATTERNS = new Set([
  'exit_nonzero',
  'timeout',
  'disk_full',
  'permission_denied',
  'file_not_found',
  'command_not_found',
  'unknown',
]);
let event = null;
if (LEDGER_PATTERNS.has(classification.pattern)) {
  event = eventLedger.openEvent({
    family: 'fail',
    tool: toolName,
    target: (toolInput && toolInput.command ? String(toolInput.command).slice(0, 60) : toolName),
    detail: String(errorMsg).slice(0, 120),
  });
  // Plan FR-01: every emitted recovery line carries [bkit:evt:<id>] — the
  // envelope rides EVERY pattern that opened a row, not only exit_nonzero
  // (Act-1 gap 1). The two silent arms never reach here: they open no row.
  if (event) {
    classification.recovery += ` ${eventLedger.envelope(event)}`;
  }
}

// Step 2: Record error pattern to PLUGIN_DATA learnings
try {
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) {
    const learningsDir = path.join(pluginData, 'learnings');
    if (!fs.existsSync(learningsDir)) {
      fs.mkdirSync(learningsDir, { recursive: true });
    }

    const learningsPath = path.join(learningsDir, 'tool-failures.json');

    // P2-TF-1: the plugin-global learnings file used an unlocked
    // read-modify-write — route it through stateStore.lockedUpdate (file lock
    // + atomic tmp+rename write), the same pattern lib/pdca/status-core.js
    // uses for the pdca status registry.
    const { lockedUpdate } = require('../lib/core/state-store');
    lockedUpdate(learningsPath, (learnings) => {
      const next = Array.isArray(learnings) ? learnings : [];
      next.push({
        timestamp: new Date().toISOString(),
        tool: toolName,
        pattern: classification.pattern,
        severity: classification.severity,
        error: String(errorMsg).substring(0, 300),
      });
      // Keep last 100 entries
      return next.slice(-100);
    });
    debugLog('ToolFailure', 'Learning recorded', { pattern: classification.pattern });
  }
} catch (e) {
  debugLog('ToolFailure', 'Learning record failed (non-critical)', { error: e.message });
}

// Step 3: Also log to audit
try {
  const { writeAuditLog } = require('../lib/audit/audit-logger');
  writeAuditLog({
    actor: 'hook',
    actorId: 'tool-failure-handler',
    action: 'gate_failed',
    category: 'control',
    target: toolName,
    targetType: 'feature',
    details: {
      pattern: classification.pattern,
      severity: classification.severity,
      error: String(errorMsg).substring(0, 300),
      isInterrupt,
    },
    result: 'failure',
  });
} catch (_) { /* non-critical */ }

// Step 4: Output recovery guidance
if (isInterrupt) {
  debugLog('ToolFailure', 'Skipping guidance (interrupt)');
  outputEmpty();
} else if (classification.pattern === 'success_suppressed') {
  // rb006: verified exit-0 event — no recovery guidance, allow silently
  debugLog('ToolFailure', 'exit0-suppressed (wave1027 FR-01)', { toolName });
  outputEmpty();
} else if (classification.pattern === 'benign_expected_failure') {
  // br878 part 2: expected-failure probe (exit-code-only, no error text) —
  // emit nothing, it is not a defect
  debugLog('ToolFailure', 'benign expected failure — no recovery guidance', { toolName });
  outputEmpty();
} else {
  outputAllow(classification.recovery, 'PostToolUseFailure');
}

debugLog('ToolFailure', 'Hook completed', {
  tool: toolName,
  pattern: classification.pattern,
  severity: classification.severity,
});
