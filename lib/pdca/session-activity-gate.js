/**
 * Session-activity gate — br143 (stop-hook-session-isolation).
 *
 * Single source of truth for "may THIS session receive the AUTO-TRANSITION
 * demand for feature F". Both stop paths share it so the router
 * (scripts/unified-stop.js gate chain) and the handler
 * (scripts/pdca-skill-stop.js shouldAutoTransition) cannot drift — the exact
 * defect class of br143 was sibling-path drift.
 *
 * br143: the fail-open is CLOSED. `!entry || !entry.ownerSession` (a legacy or
 * un-stamped entry) is a PERMANENT withhold per operator ruling 2026-10-18 —
 * no adopt-on-fire, no inference backfill. Asymmetric costs (re-running a
 * manual `/pdca` vs cross-session context poisoning) mandate fail-closed.
 *
 * Pure module: no fs/network calls. Never throws — unexpected input maps to
 * a withhold reason (`malformed-entry`), per the fail-closed contract in the
 * design (docs/02-design/features/stop-hook-session-isolation.design.en.md
 * §3.2, §4).
 *
 * @module lib/pdca/session-activity-gate
 * @version 2.1.40
 * @since 2.1.40
 */

// Lease lifetime for a feature's ownerSession (br039 semantics, moved here so
// both consumers share one constant; pdca-skill-stop.js re-exports it).
const OWNER_LEASE_MS = 2 * 60 * 60 * 1000;

/**
 * Evaluate whether the current session may receive the AUTO-TRANSITION demand.
 *
 * Verdict order (first hit wins):
 *   1. `!currentSessionId`                → withhold `no-session-id`
 *   2. `!entry`                           → withhold `no-activity`
 *   3. `!entry.ownerSession`              → withhold `unowned` (br143 fail-open CLOSED)
 *   4. `entry.ownerSession === current`   → allow `owner` (regardless of lease age)
 *   5. ownerSince present but unparseable → withhold `malformed-entry`
 *   6. `(now - ownerSince) > OWNER_LEASE_MS` → withhold `lease-expired`
 *   7. otherwise                          → withhold `foreign-session`
 *
 * `allowed === true` ONLY for reason `'owner'`.
 *
 * @param {Object|null} entry - registry feature entry (features[f])
 * @param {string|null} currentSessionId - the Stop payload's session id
 * @param {number} [now] - epoch ms (injectable for tests)
 * @returns {{allowed: boolean, reason: string}}
 */
function evaluateSessionGate(entry, currentSessionId, now = Date.now()) {
  try {
    if (!currentSessionId) return { allowed: false, reason: 'no-session-id' };
    if (!entry) return { allowed: false, reason: 'no-activity' };
    if (!entry.ownerSession) return { allowed: false, reason: 'unowned' };
    if (entry.ownerSession === currentSessionId) return { allowed: true, reason: 'owner' };
    // br143: fail-open closed — see bug_reports/active/br/br143-stop-hook-cross-session-context-poisoning.md
    const since = Date.parse(entry.ownerSince);
    if (Number.isNaN(since)) return { allowed: false, reason: 'malformed-entry' };
    if ((now - since) > OWNER_LEASE_MS) return { allowed: false, reason: 'lease-expired' };
    return { allowed: false, reason: 'foreign-session' };
  } catch (_) {
    return { allowed: false, reason: 'malformed-entry' };
  }
}

/**
 * Format the withhold stderr line. Pure — callers write it. Single formatting
 * site keeps reason codes consistent across both stop paths.
 *
 * @param {string} reason - gate reason (e.g. 'unowned', 'foreign-session')
 * @param {string} [sessionId] - the firing session id (diagnostic only)
 * @returns {string} the stderr line to write (callers append '\n')
 */
function withholdNote(reason, sessionId) {
  const note = `[bkit] AUTO-TRANSITION withheld (gate: session-activity/${reason})`;
  return sessionId ? `${note} session=${sessionId}` : note;
}

module.exports = {
  OWNER_LEASE_MS,
  evaluateSessionGate,
  withholdNote,
};
