#!/usr/bin/env node
/**
 * session-end-handler.js - SessionEnd Hook Handler (ENH-132)
 * Performs cleanup when a Claude Code session ends.
 *
 * Actions:
 *  1. Flush pending backups to PLUGIN_DATA
 *  2. Save PDCA session summary to session-history.json (keep last 20)
 *  3. Generate daily audit summary
 *  4. Cleanup stale runtime data
 *
 * Input: { session_id, reason: 'clear'|'logout'|'other' }
 * Output: none (cleanup only)
 *
 * @version 2.1.10
 * @module scripts/session-end-handler
 */

const fs = require('fs');
const path = require('path');
const { readStdinSync } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getPdcaStatusFull } = require('../lib/pdca/status');

let input;
try {
  input = readStdinSync();
} catch (e) {
  debugLog('SessionEnd', 'Failed to read stdin', { error: e.message });
  process.exit(0);
}

const sessionId = input.session_id || 'unknown';
const reason = input.reason || 'other';

debugLog('SessionEnd', 'Hook started', { sessionId, reason });

// Step 1: Flush pending backups to PLUGIN_DATA
try {
  const { backupToPluginData } = require('../lib/core/paths');
  const result = backupToPluginData();
  debugLog('SessionEnd', 'Backup flushed', result);
} catch (e) {
  debugLog('SessionEnd', 'Backup flush failed (non-critical)', { error: e.message });
}

// Step 2: Save PDCA session summary to session-history.json
try {
  const { STATE_PATHS } = require('../lib/core/paths');
  const stateDir = STATE_PATHS.state();

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const historyPath = path.join(stateDir, 'session-history.json');

  const pdcaStatus = getPdcaStatusFull();
  const summary = {
    sessionId,
    reason,
    endedAt: new Date().toISOString(),
    // Plan FR-09 (rb025 P2-SE-3): `feature`/`featureName` are dead v1 keys; the
    // v2 registry carries the active feature as `primaryFeature`.
    feature: pdcaStatus
      ? (pdcaStatus.primaryFeature || pdcaStatus.feature || null)
      : null,
    // v2.1.34: `currentPhase` is a v1 schema key and always undefined; the phase
    // lives on the feature entry.
    phase: pdcaStatus
      ? (pdcaStatus.phase
        || (pdcaStatus.primaryFeature && pdcaStatus.features
          && pdcaStatus.features[pdcaStatus.primaryFeature]
          && pdcaStatus.features[pdcaStatus.primaryFeature].phase)
        || null)
      : null,
    progress: pdcaStatus ? (pdcaStatus.progress || null) : null,
  };

  // Plan FR-09 (rb025 P2-SE-1): the read→push→writeFileSync was UNLOCKED —
  // concurrent session ends each read the same history and the last writer
  // wins, losing the other summaries. Route the RMW through lockedUpdate
  // (same primitive task-created-handler / unified-bash-post already use);
  // it serializes the read-modify-write and writes atomically.
  const { lockedUpdate } = require('../lib/core/state-store');
  lockedUpdate(historyPath, (current) => {
    const history = Array.isArray(current) ? current : [];
    history.push(summary);
    // Keep only the last 20 entries
    return history.length > 20 ? history.slice(-20) : history;
  });
  debugLog('SessionEnd', 'Session summary saved', { sessionId });
} catch (e) {
  debugLog('SessionEnd', 'Session summary save failed (non-critical)', { error: e.message });
}

// Step 3: Generate daily audit summary
try {
  const { writeAuditLog } = require('../lib/audit/audit-logger');
  writeAuditLog({
    actor: 'hook',
    actorId: 'session-end-handler',
    action: 'session_end',
    category: 'control',
    target: sessionId,
    targetType: 'feature',
    details: { reason },
    result: 'success',
  });
  debugLog('SessionEnd', 'Audit summary written');
} catch (e) {
  debugLog('SessionEnd', 'Audit write failed (non-critical)', { error: e.message });
}

// Step 4: Cleanup stale runtime data
//
// Plan FR-09 (rb025 P2-SE-2): the old janitor deleted ANY file in runtime/
// idle >= 24h, including first-run-seen.json (the user's "Skip permanently"
// silently reverted), cc-version.json, agent-state.json, control-state.json,
// error-log.json (the stop-failure postmortem ring) and memory-directives.json.
// Deny-biased policy now: the janitor deletes ONLY artifacts from its own
// namespace — the *.tmp / *.bak leftovers of the atomic-write pattern this
// codebase uses — everything else in runtime/ is preserved regardless of age.
try {
  const { STATE_PATHS } = require('../lib/core/paths');
  const runtimeDir = STATE_PATHS.runtime();

  // Artifacts the janitor itself owns (named, not inferred): orphaned
  // temp/backup files left by interrupted atomic writes. User preference
  // and state files are NEVER in this namespace, so they can never match.
  const JANITOR_OWNED = [/\.tmp$/, /\.bak$/, /\.lock$/];

  if (fs.existsSync(runtimeDir)) {
    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const files = fs.readdirSync(runtimeDir);

    for (const file of files) {
      if (!JANITOR_OWNED.some((re) => re.test(file))) continue; // preserve
      const filePath = path.join(runtimeDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.mtimeMs < staleThreshold) {
          fs.unlinkSync(filePath);
          debugLog('SessionEnd', 'Stale janitor-owned artifact removed', { file });
        }
      } catch (_) { /* skip individual file errors */ }
    }
  }
} catch (e) {
  debugLog('SessionEnd', 'Cleanup failed (non-critical)', { error: e.message });
}

// v2.1.10 Sprint 5.5: cc-regression attribution (fail-silent)
try {
  const cc = require('../lib/cc-regression');
  const ccVersion = cc.detectCCVersion();
  if (ccVersion) {
    cc.recordEvent({
      hookEvent: 'SessionEnd',
      ccVersion,
      sessionId,
      timestamp: new Date().toISOString(),
      context: { reason },
    });
  }
} catch (e) {
  debugLog('SessionEnd', 'cc-regression recordEvent failed', { error: e.message });
}

// v2.1.10 Sprint 7c (G-J-06): Next Action suggestion on SessionEnd (resume hint)
try {
  const { generateSessionEnd } = require('../lib/orchestrator/next-action-engine');
  const { getPdcaStatusFull } = require('../lib/pdca/status');
  const pdcaStatus = (typeof getPdcaStatusFull === 'function') ? getPdcaStatusFull() : null;
  const hint = generateSessionEnd({ pdcaStatus });
  if (hint) debugLog('SessionEnd', 'NextAction hint', { hint });
} catch (_e) { /* fail-silent */ }

debugLog('SessionEnd', 'Hook completed', { sessionId, reason });
process.exit(0);
