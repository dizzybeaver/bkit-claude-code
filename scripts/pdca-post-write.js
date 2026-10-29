#!/usr/bin/env node
/**
 * pdca-post-write.js - PDCA post-write tracking handler
 *
 * rb021 (hook-audit-1028): this file was required by
 * scripts/unified-write-post.js:43 but did not exist in the repo, the live
 * plugin cache, or git history — MODULE_NOT_FOUND was swallowed to debugLog
 * and the "always runs (core bkit-rules functionality)" PDCA post-write arm
 * was dead on every Write/Edit. This restores the module implementing the
 * exact contract the caller consumes: a `run(input)` function invoked once
 * per Write/Edit (unified-write-post.js:46-48). Nothing more.
 *
 * Contract: run(input) records the written file against the ACTIVE primary
 * feature — a lastFile stamp scoped to the writing session (rb032's
 * cross-session contamination fix applied here too). The feature's phase is
 * PRESERVED: this handler never moves a phase, so it can never regress one.
 * When no active feature exists, it is a no-op (direct writes outside a
 * cycle carry no PDCA tracking).
 *
 * Plan FR-07
 *
 * @module scripts/pdca-post-write
 */

// Plan FR-07: PDCA post-write tracking — stamp the write on the active
// feature, phase-preserving and session-scoped.
function run(input) {
  const { parseHookInput } = require('../lib/core/io');
  const { debugLog } = require('../lib/core/debug');
  const { getPdcaStatusFull, updatePdcaStatus } = require('../lib/pdca/status');

  const { filePath } = parseHookInput(input || {});
  if (!filePath) {
    debugLog('PdcaPostWrite', 'No file path in hook input; skipping');
    return false;
  }

  const status = getPdcaStatusFull();
  const feature = status && status.primaryFeature;
  const row = feature && status.features ? status.features[feature] : null;
  if (!feature || !row) {
    debugLog('PdcaPostWrite', 'No active PDCA feature; skipping', { filePath });
    return false;
  }

  // Phase-preserving stamp: pass the CURRENT phase straight through so this
  // write can never advance OR regress the cycle (rb021/rb032).
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID || null;
  updatePdcaStatus(feature, row.phase, {
    lastFile: filePath,
    lastFileSession: sessionId,
  });
  debugLog('PdcaPostWrite', 'Write stamped on active feature', {
    feature, phase: row.phase, filePath, sessionId,
  });
  return true;
}

module.exports = { run };
