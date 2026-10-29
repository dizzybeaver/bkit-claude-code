/**
 * event-ledger.js - Shared hook-event ledger for emission envelopes
 * Records hook events (failures, warnings) with stable ids, resolves them on
 * corrective actions, and prunes by TTL/caps so replays stay bounded.
 *
 * @module lib/core/event-ledger
 * @version 2.1.40
 */
// Design Ref: §3/§4 — shared hook-event ledger (stale-replay-fix-1029)

const crypto = require('crypto');
const path = require('path');

// Local
const { lockedUpdate } = require('./state-store');
const { debugLog } = require('./debug');

const EVENT_TTL_MS = 90 * 60 * 1000;
const MAX_OPEN_PER_SESSION = 50;
const MAX_TOTAL_ROWS = 200;
const TARGET_MAX = 200;
const DETAIL_MAX = 120;

// Per-process monotonic seed so two openEvent calls in the same second for the
// same tool+target still mint distinct ids (design §6.1 double-fire race case).
let seq = 0;

function ledgerPath() {
  return path.join(process.env.CLAUDE_PLUGIN_DATA, 'learnings', 'hook-events.json');
}

// '2026-10-29T13:45:12.000Z' -> '20261029T134512'
function compactTs(iso) {
  return iso.replace(/[-:]/g, '').split('.')[0];
}

function mintId(family, tool, target, ts, session) {
  const hash = crypto
    .createHash('sha1')
    .update(`${tool}|${target}|${ts}|${session}|${++seq}`)
    .digest('hex')
    .slice(0, 6);
  return `${family.slice(0, 3)}-${compactTs(ts)}-${hash}`;
}

// Design Ref: §4 — caps enforced at insert; drop oldest-resolved first, then oldest
function enforceCaps(rows, session) {
  const oldestIndex = (predicate) => {
    let idx = -1;
    let oldest = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (predicate(row) && (oldest === null || row.ts < oldest)) {
        oldest = row.ts;
        idx = i;
      }
    }
    return idx;
  };

  let working = rows;
  for (;;) {
    const openForSession = working.filter(
      (r) => r.resolvedAt === null && r.session === session
    ).length;
    if (openForSession <= MAX_OPEN_PER_SESSION && working.length <= MAX_TOTAL_ROWS) {
      return working;
    }
    let victim;
    if (openForSession > MAX_OPEN_PER_SESSION) {
      // session open cap: only an unresolved row of this session frees it
      victim = oldestIndex((r) => r.resolvedAt === null && r.session === session);
    } else {
      victim = oldestIndex((r) => r.resolvedAt !== null);
      if (victim === -1) {
        victim = oldestIndex(() => true);
      }
    }
    if (victim === -1) {
      return working;
    }
    working = working.filter((_, i) => i !== victim);
  }
}

// Design Ref: §4 — every mutation prunes expired rows in the same
// lockedUpdate (openEvent insert AND resolveEventsDetailed resolve both
// sweep, Act-1 gaps 2/7). The pruned count traces BOTH sides: the pruned=0
// case logs too, so every prune decision is visible.
function pruneExpired(rows, now) {
  const live = rows.filter((r) => r && r.expiresAt > now);
  debugLog('EventLedger', 'expired rows pruned', { pruned: rows.length - live.length });
  return live;
}

function openEvent({ family, tool, target, detail }) {
  if (!process.env.CLAUDE_PLUGIN_DATA) {
    debugLog('EventLedger', 'no-plugin-data — openEvent no-op', { family });
    return null;
  }
  try {
    const ts = new Date().toISOString();
    const session = process.env.CLAUDE_CODE_SESSION_ID || 'nosession';
    const id = mintId(family, tool, target, ts, session);
    lockedUpdate(ledgerPath(), (rows) => {
      const next = Array.isArray(rows) ? rows : [];
      const now = Date.now();
      const live = pruneExpired(next, now);
      live.push({
        id,
        family,
        tool,
        target: String(target || '').slice(0, TARGET_MAX),
        detail: String(detail || '').slice(0, DETAIL_MAX),
        ts,
        session,
        expiresAt: now + EVENT_TTL_MS,
        resolvedAt: null,
      });
      return enforceCaps(live, session);
    });
    debugLog('EventLedger', 'event opened', { id, family, tool });
    return { id, ts };
  } catch (e) {
    debugLog('EventLedger', 'openEvent failed (fail-open)', { error: e.message });
    return null;
  }
}

// Design Ref: §5 — HOS-14/HOS-16/TC-HC-33 announcements name the superseded ids
function resolveEventsDetailed(family, { tool, target } = {}) {
  if (!process.env.CLAUDE_PLUGIN_DATA) {
    debugLog('EventLedger', 'no-plugin-data — resolveEvents no-op', { family });
    return { count: 0, ids: [] };
  }
  try {
    const ids = [];
    lockedUpdate(ledgerPath(), (rows) => {
      const now = Date.now();
      const resolved = (Array.isArray(rows) ? rows : []).map((r) => {
        if (
          r &&
          r.family === family &&
          r.tool === tool &&
          r.target === target &&
          r.resolvedAt === null
        ) {
          ids.push(r.id);
          return { ...r, resolvedAt: now };
        }
        return r;
      });
      // Design Ref: §4 — the resolve mutation prunes expired rows in the
      // same lockedUpdate (Act-1 gap 2).
      return pruneExpired(resolved, now);
    });
    if (ids.length > 0) {
      debugLog('EventLedger', 'resolve-hit', { family, tool, target, resolved: ids.length });
    } else {
      debugLog('EventLedger', 'resolve-miss', { family, tool, target });
    }
    return { count: ids.length, ids };
  } catch (e) {
    debugLog('EventLedger', 'resolveEvents failed (fail-open)', { error: e.message });
    return { count: 0, ids: [] };
  }
}

function resolveEvents(family, { tool, target } = {}) {
  return resolveEventsDetailed(family, { tool, target }).count;
}

function envelope(event) {
  return `[bkit:evt:${event.id}]`;
}

module.exports = {
  EVENT_TTL_MS,
  openEvent,
  resolveEvents,
  resolveEventsDetailed,
  envelope,
};
