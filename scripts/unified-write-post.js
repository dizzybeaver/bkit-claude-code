#!/usr/bin/env node
/**
 * unified-write-post.js - Unified Write PostToolUse Handler (v1.4.4)
 *
 * GitHub Issue #9354 Workaround:
 * Consolidates Write PostToolUse hooks from:
 * - bkit-rules: pdca-post-write.js (always runs)
 * - phase-5-design-system: phase5-design-post.js
 * - phase-6-ui-integration: phase6-ui-post.js
 * - qa-monitor: qa-monitor-post.js
 */

const path = require('path');
const fs = require('fs');
const { readStdinSync, parseHookInput, outputAllow } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getActiveSkill, getActiveAgent } = require('../lib/task/context');
const { validateDocument, formatValidationWarning } = require('../lib/pdca/template-validator.js');
// C7/C8 (audit): atomic+locked reachability ping + single BKIT_VERSION source.
const { lockedUpdate } = require('../lib/core/state-store');
const { BKIT_VERSION } = require('../lib/core/version');

// stale-replay-fix-1029 (Module-2): event ledger tagging for template warnings.
// Lazy + guarded require: an unavailable ledger must fail-open (design §6.1),
// never break the hook.
let eventLedger = null;
try { eventLedger = require('../lib/core/event-ledger'); } catch (_) { /* fail-open */ }

// M10 fix (audit): the layer-6 auditPostHoc call below is intentionally
// fire-and-forget (PostToolUse must not block tool flow), so it is not awaited.
// A rejection that resolves AFTER the synchronous hook body completes would
// surface as a process-level unhandled-rejection. The .catch() on the call
// handles the in-flight case; this handler covers the post-tick case.
//
// rb021/rb031 (hook-audit-1028): the previous `(_reason) => {}` was a
// process-wide swallower — the exact pattern lib/core/_io/observability.js:143
// documents as abandoned (a listener here also suppresses Node 15+ default
// fatal behavior, so a real async defect was doubly invisible). Log every
// rejection instead of eating it.
process.on('unhandledRejection', (reason) => {
  debugLog('UnifiedWritePost', 'Unhandled rejection', {
    error: reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason),
  });
});

// ============================================================
// Handler: pdca-post-write (always runs - core bkit-rules)
// ============================================================

/**
 * PDCA post-write handler - always runs for PDCA tracking
 * @param {Object} input - Hook input
 * @returns {boolean} True if executed
 */
function handlePdcaPostWrite(input) {
  try {
    // Call existing pdca-post-write.js
    const handlerPath = path.join(__dirname, 'pdca-post-write.js');
    const handler = require(handlerPath);

    if (typeof handler.run === 'function') {
      handler.run(input);
    }
    // If self-executing, it already ran when required
    return true;
  } catch (e) {
    // rb021 (hook-audit-1028): a dead PDCA post-write used to vanish into
    // debugLog alone. This is core bkit-rules functionality — failure must
    // be LOUD, not silent.
    debugLog('UnifiedWritePost', 'pdca-post-write failed', { error: e.message });
    console.error(`[bkit] pdca-post-write FAILED: ${e.message}`);
    return false;
  }
}

// ============================================================
// Handler: phase5-design-post
// ============================================================

/**
 * Phase 5 design system component tracking
 * @param {Object} input - Hook input
 * @param {string} filePath - Written file path
 * @returns {boolean} True if executed
 */
function handlePhase5DesignPost(input, filePath) {
  if (!filePath) return false;

  // Track component files for design system
  if (filePath.includes('components/') || filePath.includes('design-system/')) {
    debugLog('UnifiedWritePost', 'Design system component written', { filePath });

    // Additional phase-5 specific logic could go here:
    // - Update component registry
    // - Validate design token usage
    // - Check naming conventions
  }
  return true;
}

// ============================================================
// Handler: phase6-ui-post
// ============================================================

/**
 * Phase 6 UI integration tracking
 * @param {Object} input - Hook input
 * @param {string} filePath - Written file path
 * @returns {boolean} True if executed
 */
function handlePhase6UiPost(input, filePath) {
  if (!filePath) return false;

  // Track UI page/component files
  if (filePath.includes('pages/') || filePath.includes('app/') || filePath.includes('views/')) {
    debugLog('UnifiedWritePost', 'UI page written', { filePath });

    // Additional phase-6 specific logic could go here:
    // - Validate API integration patterns
    // - Check state management usage
    // - Verify error handling
  }
  return true;
}

// ============================================================
// Handler: qa-monitor-post (Write)
// ============================================================

/**
 * QA monitor write tracking
 * @param {Object} input - Hook input
 * @param {string} filePath - Written file path
 * @returns {boolean} True if executed
 */
function handleQaMonitorPost(input, filePath) {
  if (!filePath) return false;

  debugLog('UnifiedWritePost', 'QA monitor: file written', { filePath });

  // QA-specific tracking:
  // - Log file changes for test verification
  // - Track test file modifications
  return true;
}

// ============================================================
// Main Execution
// ============================================================

debugLog('UnifiedWritePost', 'Hook started');

// Read hook context
let input = {};
try {
  input = readStdinSync();
  if (typeof input === 'string') {
    input = JSON.parse(input);
  }
} catch (e) {
  debugLog('UnifiedWritePost', 'Failed to parse input', { error: e.message });
}

// Parse file path from input
const { filePath } = parseHookInput(input);

// Get current context
const activeSkill = getActiveSkill();
const activeAgent = getActiveAgent();

debugLog('UnifiedWritePost', 'Context', { activeSkill, activeAgent, filePath });

// v2.1.14 Sub-Sprint 2: Reachability ping (MON-CC-NEW-PLUGIN-HOOK-DROP).
// SessionStart compares the ts of each PostToolUse stamp to detect silent
// CC plugin-hook drops (#57317 5-streak surface). MUST fire on EVERY
// invocation — including the template-validation failure path below that
// calls process.exit(0). When this ping lived at the END of the hook, that
// exit path skipped it: a written PDCA doc failing template validation
// recorded no write_post stamp, so write_post could go stale and trip a
// false missing=[write_post] warning. Ping first, work second. (Symmetric
// with scripts/skill-post.js, which carried the same gating bug on its
// skip path; scripts/unified-bash-post.js has no early exit so its
// end-of-hook ping is already unconditional.)
try {
  // C7: lockedUpdate serializes concurrent fires so no hook's stamp is lost;
  // C8: BKIT_VERSION replaces the stale hardcoded '2.1.14'.
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const file = path.join(root, '.bkit', 'runtime', 'hook-reachability.json');
  lockedUpdate(file, (state) => {
    const next = state && typeof state === 'object' ? state : {};
    next.write_post = { ts: new Date().toISOString(), version: BKIT_VERSION };
    return next;
  });
} catch (_) { /* graceful — reachability ping is best-effort */ }

// Always run PDCA post-write (core bkit-rules functionality)
handlePdcaPostWrite(input);

// Conditional handlers based on active skill/agent
if (activeSkill === 'phase-5-design-system') {
  handlePhase5DesignPost(input, filePath);
}

if (activeSkill === 'phase-6-ui-integration') {
  handlePhase6UiPost(input, filePath);
}

if (activeAgent === 'qa-monitor') {
  handleQaMonitorPost(input, filePath);
}

// v1.6.0 ENH-103: PDCA template validation
// stale-replay-fix-1029 (Module-2): warnings open a 'tpl' ledger event and are
// tagged with its envelope; a later valid validation resolves those events and
// announces the retirement. Exactly one stdout payload per invocation (§6.2):
// the warning branch exits after its own payload; the pass path's RESOLVED
// notice rides the end-of-hook outputAllow via `hookNotice` (quiet when 0 —
// br010). Fail-open everywhere: a missing/throwing ledger changes nothing.
let hookNotice = '';
if (filePath) {
  const toolName = input.tool_name || 'Write';
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = validateDocument(filePath, content);

    if (!result.valid && result.missing.length > 0) {
      let warning = formatValidationWarning(result);
      // Design Ref: stale-replay-fix-1029 §5/§11.2 Module-2 — tag the warning
      // with a ledger envelope so a later pass can retire it as stale.
      let event = null;
      try {
        event = eventLedger.openEvent({
          family: 'tpl',
          tool: toolName,
          target: filePath,
          detail: 'missing: ' + result.missing.join(', ').slice(0, 100),
        });
      } catch (_) { /* fail-open: warning still emits untagged */ }
      if (event) {
        warning = `${eventLedger.envelope(event)} (ts ${event.ts}): ${warning}`;
      }
      debugLog('UnifiedWritePost', 'Template validation failed', {
        filePath, type: result.type, missing: result.missing
      });
      outputAllow(warning, 'PostToolUse');
      debugLog('UnifiedWritePost', 'Hook completed with template warning');
      process.exit(0);
    }

    // Design Ref: stale-replay-fix-1029 §5/§11.2 Module-2 — a valid template
    // validation retires open events for this file; the announce names the
    // superseded ids (HOS-14) via resolveEventsDetailed's { count, ids }.
    if (result.valid) {
      let detailed = null;
      try {
        detailed = eventLedger.resolveEventsDetailed('tpl', { tool: toolName, target: filePath });
      } catch (_) { /* fail-open */ }
      if (detailed && detailed.count > 0 && detailed.ids && detailed.ids.length > 0) {
        hookNotice = `[bkit:evt:${detailed.ids.join(',')}] RESOLVED — ${path.basename(filePath)} now passes template validation at ${new Date().toISOString()}; earlier template warnings for this file are stale`;
      }
    }
  } catch (e) {
    debugLog('UnifiedWritePost', 'Template validation error', { error: e.message });
  }
}

// v2.0.0: Audit logging for file write
try {
  const toolInput = input.tool_input || {};
  const audit = require('../lib/audit/audit-logger');
  audit.writeAuditLog({
    actor: 'system', actorId: 'unified-write-post',
    action: toolInput.file_path ? 'file_modified' : 'file_created',
    category: 'file',
    target: toolInput.file_path || '', targetType: 'file',
    result: 'success', destructiveOperation: false
  });
} catch (_) {}

// v2.0.0: Loop detection for repeated file edits
try {
  const toolInput = input.tool_input || {};
  const lb = require('../lib/control/loop-breaker');
  lb.recordAction('file_edit', toolInput.file_path || 'unknown');
  const loopCheck = lb.checkLoop();
  if (loopCheck.detected) {
    debugLog('UnifiedWritePost', 'Loop detected in file edits', {
      target: toolInput.file_path, details: loopCheck
    });
  }
} catch (_) {}

// v2.0.0: Metrics update if PDCA feature is active
try {
  const { getPdcaStatusFull } = require('../lib/pdca/status');
  const pdcaStatus = getPdcaStatusFull();
  // v2.1.34: `currentFeature` is a v1 schema key the v3 migration renamed to
  // `primaryFeature`, so this condition was permanently false and the
  // file_change_count metric was never collected once.
  if (pdcaStatus && pdcaStatus.primaryFeature) {
    const mc = require('../lib/quality/metrics-collector');
    mc.collectMetric('file_change_count', pdcaStatus.primaryFeature, 1, 'unified-write-post');
  }
} catch (_) {}

// ============================================================
// v2.1.14 Sub-Sprint 2: PostToolUse Layer-6 Tier 1 audit (ENH-289 #2)
// + reachability ping (MON-CC-NEW-PLUGIN-HOOK-DROP)
// Symmetric with scripts/unified-bash-post.js — see that file for rationale.
// ============================================================
try {
  const layer6Mod = require('../lib/defense/layer-6-audit');
  const auditLogger = require('../lib/audit/audit-logger');
  let checkpointMgr = null;
  try { checkpointMgr = require('../lib/control/checkpoint-manager'); } catch (_) { /* graceful */ }
  let ac = null;
  try { ac = require('../lib/control/automation-controller'); } catch (_) { /* graceful */ }
  const trustLevel = (() => {
    try { const lv = ac && ac.getCurrentLevel(); return typeof lv === 'string' ? lv : (lv != null ? `L${lv}` : 'L2'); }
    catch (_) { return 'L2'; }
  })();
  if (checkpointMgr) {
    const layer6 = layer6Mod.createLayer6Audit({
      audit: auditLogger,
      checkpoint: checkpointMgr,
      trustLevelProvider: () => trustLevel,
      warn: () => {},
    });
    layer6.auditPostHoc({
      tool: input.tool_name || 'Write',
      toolInput: input.tool_input || {},
      toolOutput: input.tool_response || input.tool_output || {},
      feature: input.feature || (input.context && input.context.feature),
      phase: input.phase || (input.context && input.context.phase),
    }).catch(() => { /* graceful */ });
  }
} catch (_) { /* graceful */ }

// Output allow (PostToolUse doesn't block). hookNotice carries the optional
// template RESOLVED announcement — still exactly one stdout payload (§6.2).
outputAllow(hookNotice, 'PostToolUse');

debugLog('UnifiedWritePost', 'Hook completed');
