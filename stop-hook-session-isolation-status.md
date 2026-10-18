# stop-hook-session-isolation — dispatch status (shared)

Feature: PDCA bug-fix cycle for br143 (cross-session stop-hook poisoning).
Registry phase: do. Bug-fix path per work.md §45.9 (no gap/iterate/qa).

## Roster

| # | Agent | Scope | Outcome |
|---|-------|-------|---------|
| 1 | shsi-build (killed 11:01, deadline miss) | gate module + scripts + tests | Steps 1-3 LANDED; steps 4-5 not started |

## Tree state (verified by MAIN 11:03, node --check all OK)

- lib/pdca/session-activity-gate.js — EXISTS (3710 B): evaluateSessionGate/withholdNote/OWNER_LEASE_MS
- scripts/pdca-skill-stop.js — REWIRED to delegate; exports preserved; parses OK
- scripts/unified-stop.js — gate (e) landed at :232-253 (session-activity/<reason>, fail-closed catch → 'session-activity/error'); parses OK
- test/contract/session-activity-gate.test.js — MISSING (step 4)
- updatePdcaStatus stamping audit (step 5, FR-04) — NOT DONE
- Backup: work/backups/stop-hook-session-isolation-pre-do-*/ (pre-change pdca-skill-stop.js + unified-stop.js)

## Remaining work for replacement

1. NEW test/contract/session-activity-gate.test.js — TS-1..TS-10 per design §8.2 (unit + contract: shouldAutoTransition delegation; unified-stop shouldSkipAutoTransition gates)
2. Step 5 audit: enumerate updatePdcaStatus write paths; report stamping gaps (stamp only where session id available at zero design change; report design-change gaps, don't implement)
3. Self-check: npx jest test/contract/session-activity-gate.test.js once

## Deadlines

- Dispatch 1: 10:50 → killed 11:01 (miss)
- Dispatch 2: 11:04 → deadline 11:14 (armed). SECOND MISS = MAIN finishes in-session.
