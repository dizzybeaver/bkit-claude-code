#!/usr/bin/env node
/**
 * unified-bash-post.js - Unified Bash PostToolUse Handler (v1.4.4)
 *
 * GitHub Issue #9354 Workaround:
 * Consolidates Bash PostToolUse hooks from:
 * - qa-monitor: qa-monitor-post.js
 */

const { readStdinSync, parseHookInput, outputAllow } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getActiveSkill, getActiveAgent } = require('../lib/task/context');
// C7/C8 (audit): atomic+locked reachability ping via the shared state-store, and
// a single BKIT_VERSION source so all three reachability writers stamp the same value.
const { lockedUpdate } = require('../lib/core/state-store');
const { BKIT_VERSION } = require('../lib/core/version');

// stale-replay-fix-1029 (Module-2b): event ledger resolve for Bash failure
// notices. Lazy + guarded require: an unavailable ledger must fail-open
// (design §6.1), never break the hook.
let eventLedger = null;
try { eventLedger = require('../lib/core/event-ledger'); } catch (_) { /* fail-open */ }

// Optional end-of-hook advisory (see the resolve block in the audit section);
// rides the single outputAllow payload so the hook stays one-message (§6.2).
let hookNotice = '';

// M10 fix (audit, rb031): the layer-6 auditPostHoc call below is intentionally
// fire-and-forget (PostToolUse must not block tool flow), so it is not awaited.
// A rejection that resolves AFTER the synchronous hook body completes would
// surface as a process-level unhandled-rejection. The .catch() on the call
// handles the in-flight case; this handler covers the post-tick case.
//
// rb031: the previous `(_reason) => {}` was a process-wide swallower — the
// exact pattern lib/core/_io/observability.js:143 documents as abandoned
// (a listener here also suppresses Node 15+ default fatal behavior, so a real
// async defect was doubly invisible). Log every rejection instead of eating it.
process.on('unhandledRejection', (reason) => {
  debugLog('UnifiedBashPost', 'Unhandled rejection', {
    error: reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason),
  });
});

// ============================================================
// Handler: qa-monitor-post (Bash)
// ============================================================

/**
 * QA monitor Bash command tracking
 * @param {Object} input - Hook input
 * @returns {boolean} True if executed
 */
function handleQaMonitorBashPost(input) {
  const { command } = parseHookInput(input);
  if (!command) return false;

  // Log docker/curl commands for QA analysis
  const qaRelevantPatterns = ['docker', 'curl', 'npm test', 'jest', 'pytest', 'go test'];

  for (const pattern of qaRelevantPatterns) {
    if (command.includes(pattern)) {
      debugLog('UnifiedBashPost', 'QA relevant command executed', {
        pattern,
        command: command.substring(0, 100)
      });
      break;
    }
  }

  return true;
}

// ============================================================
// Main Execution
// ============================================================

debugLog('UnifiedBashPost', 'Hook started');

// Read hook context
let input = {};
try {
  input = readStdinSync();
  if (typeof input === 'string') {
    input = JSON.parse(input);
  }
} catch (e) {
  debugLog('UnifiedBashPost', 'Failed to parse input', { error: e.message });
}

// Get current context
const activeSkill = getActiveSkill();
const activeAgent = getActiveAgent();

debugLog('UnifiedBashPost', 'Context', { activeSkill, activeAgent });

// Only qa-monitor has Bash PostToolUse handler
if (activeAgent === 'qa-monitor') {
  handleQaMonitorBashPost(input);
}

// v2.0.0: Audit logging for bash commands
// Plan FR-10 (rb031 P2-UBP-2): the row used to record result:'success'
// unconditionally — failed commands overstated the ledger (false-assurance
// family). Derive the outcome from the payload: 'failure' on any failure
// signal, 'success' ONLY on a confirmed exit code 0, and 'skipped' with
// details.outcome='unmeasured' when the payload carries no signal at all
// (never fabricate). Exit-code extraction mirrors tool-failure-handler rb006.
try {
  const toolInput = input.tool_input || {};
  const command = toolInput.command || '';
  const toolResponse = input.tool_response || input.tool_output || null;
  const toolError = input.tool_error || input.error || '';
  const exitMatch = String(toolError).match(/exit (?:code|status)[:\s]*(\d+)/i);
  const exitCode = exitMatch
    ? parseInt(exitMatch[1], 10)
    : (toolResponse && typeof toolResponse === 'object'
      ? (typeof toolResponse.exit === 'number' ? toolResponse.exit
        : (typeof toolResponse.exitCode === 'number' ? toolResponse.exitCode : null))
      : null);
  const failed = exitCode === null
    ? Boolean(toolError)
      || (toolResponse && typeof toolResponse === 'object'
        && (toolResponse.error || toolResponse.interrupted))
    : exitCode !== 0;
  const result = exitCode === 0 ? 'success' : (failed ? 'failure' : 'skipped');
  const audit = require('../lib/audit/audit-logger');
  audit.writeAuditLog({
    actor: 'system', actorId: 'unified-bash-post',
    action: 'command_executed',
    category: 'bash',
    target: command.substring(0, 200), targetType: 'command',
    result,
    details: exitCode === null && result === 'skipped'
      ? { outcome: 'unmeasured', exitCode: null }
      : { outcome: result, exitCode },
    destructiveOperation: false
  });
  // Design Ref: stale-replay-fix-1029 §5/§11.2 Module-2b — on a confirmed
  // exit 0, retire open 'fail' events for this command. Target must mirror
  // module-1 exactly: first 60 chars of input.tool_input.command. The announce
  // names the superseded ids (HOS-16) via resolveEventsDetailed's
  // { count, ids }. br010: the quiet path stays quiet — nothing is set when
  // nothing resolved; the advisory rides the end-of-hook outputAllow payload
  // (§6.2 single-payload).
  if (result === 'success' && eventLedger) {
    const detailed = eventLedger.resolveEventsDetailed('fail', {
      tool: 'Bash',
      target: command.slice(0, 60),
    });
    if (detailed && detailed.count > 0 && detailed.ids && detailed.ids.length > 0) {
      hookNotice = `[bkit:evt:${detailed.ids.join(',')}] RESOLVED — Bash exit 0 at ${new Date().toISOString()}; earlier failure notices for this command are stale`;
    }
  }
} catch (_) {}

// v2.0.0: loop-breaker checkpoint after a Bash command completes.
//
// ENH-378: this used to call `recordAction('bash_command', …)` first. No LB rule
// consumes that actionType — the switch in lib/control/loop-breaker.js handles
// pdca_iteration / file_edit / agent_call / error only, and there is no
// `guardrails.loopBreaker` config key or design doc for a bash rule either. The
// call fell through and did nothing from v2.0.0 onward, while the block's name
// implied bash commands were being counted. Recording was removed rather than a
// rule invented, since adding one is a feature decision, not a bug fix.
//
// `checkLoop()` is kept: it evaluates LB-001/002/004 from the persisted
// cross-process counters, and a completed Bash command is a legitimate point to
// notice that some other loop is running away.
try {
  const toolInput = input.tool_input || {};
  const command = toolInput.command || '';
  const lb = require('../lib/control/loop-breaker');
  const loopCheck = lb.checkLoop();
  if (loopCheck.detected) {
    debugLog('UnifiedBashPost', 'Loop detected at bash checkpoint', {
      command: command.substring(0, 100), details: loopCheck
    });
  }
} catch (_) {}

// ============================================================
// v2.1.14 Sub-Sprint 2: PostToolUse Layer-6 Tier 1 audit (ENH-289 #2)
// + continueOnBlock deny-reason emission (ENH-303 #5)
//
// Runs after loop-breaker recordAction so the same input is observed by both
// the loop guard and the layer-6 classifier. Fail-silent in all branches —
// PostToolUse never blocks normal tool flow today; this hook only widens
// observability + sets up the auto-rollback decision at L4.
//
// Reachability ping (MON-CC-NEW-PLUGIN-HOOK-DROP): touch the reachability
// state file so SessionStart can detect silent CC plugin-hook drops.
// ============================================================
try {
  const toolInput = input.tool_input || {};
  const toolOutput = input.tool_response || input.tool_output || {};
  const layer6Mod = require('../lib/defense/layer-6-audit');
  const auditLogger = require('../lib/audit/audit-logger');
  let checkpointMgr = null;
  try { checkpointMgr = require('../lib/control/checkpoint-manager'); } catch (_) { /* graceful */ }
  let ac = null;
  try { ac = require('../lib/control/automation-controller'); } catch (_) { /* graceful */ }
  // Plan FR-10 (rb031 P2-UBP-1): a failed trustLevel read used to fabricate a
  // literal 'L2' — a never-measured value feeding layer-6 math (same
  // fabricated-default family as rb018). Degrade to 'unknown' and SKIP the
  // layer-6 audit entirely; unknown trust must never be treated as measured.
  const trustLevel = (() => {
    try {
      const lv = ac && ac.getCurrentLevel();
      if (lv == null) return 'unknown';
      return typeof lv === 'string' ? lv : `L${lv}`;
    } catch (_) {
      return 'unknown';
    }
  })();
  if (checkpointMgr && trustLevel !== 'unknown') {
    const layer6 = layer6Mod.createLayer6Audit({
      audit: auditLogger,
      checkpoint: checkpointMgr,
      trustLevelProvider: () => trustLevel,
      // suppress console.warn in hook context — audit-logger captures it
      warn: () => {},
    });
    // Fire-and-forget; PostToolUse must not await beyond timeout budget
    layer6.auditPostHoc({
      tool: 'Bash',
      toolInput,
      toolOutput,
      feature: input.feature || (input.context && input.context.feature),
      phase: input.phase || (input.context && input.context.phase),
    }).catch(() => { /* graceful */ });
  } else if (trustLevel === 'unknown') {
    // rb031: the skip itself must be visible — log silence here was exactly
    // how the fabricated 'L2' stayed unnoticed (debug-trace-first).
    debugLog('UnifiedBashPost', 'Layer-6 audit skipped: trustLevel unknown (read failure)', {});
  }
} catch (_) { /* layer-6 unavailable — fail-open */ }

// Reachability ping — atomic+locked RMW so concurrent hook fires never lose a
// stamp (C7), stamped with the single BKIT_VERSION source (C8).
try {
  const path = require('path');
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const file = path.join(root, '.bkit', 'runtime', 'hook-reachability.json');
  lockedUpdate(file, (state) => {
    const next = state && typeof state === 'object' ? state : {};
    next.bash_post = { ts: new Date().toISOString(), version: BKIT_VERSION };
    return next;
  });
} catch (_) { /* graceful — reachability ping is best-effort */ }

/*
 * Output allow. PostToolUse does not block normal flow.
 *
 * ENH-432 (v2.1.37) — the comment that stood here said this call emits
 * `hookSpecificOutput` with `continueOnBlock=true` and an audit reason. It does
 * not, and it never could: `outputAllow('', 'PostToolUse')` emits the minimal
 * envelope, and `continueOnBlock` is a configuration field on a PROMPT-type hook
 * definition — confirmed at three places in the v2.1.232 binary — while all 28
 * bkit hook handlers are `"type": "command"`. There is no spelling of this call
 * that would have worked.
 *
 * The layer-6 audit above does write its own entries through auditLogger, and
 * that part was always true. What was never true was the block-decision half.
 */
outputAllow(hookNotice, 'PostToolUse');

debugLog('UnifiedBashPost', 'Hook completed');
