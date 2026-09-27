# PRD — fix-br015-stop-dispatch

**Date:** 2026-09-27
**Source:** br015 (High) — root cause of the br009/br011/br014 Stop-advance family
**Cycle shape:** bug-fix PDCA (work.md §45.9): pm→plan→design→do→report→archive

## Problem

`scripts/unified-stop.js:117-119` reads `pdcaStatus.session.lastSkill` via `getActiveSkill()` to route Stop events to per-skill handlers, but NO code anywhere writes `session.lastSkill` (verified: grep across scripts/ + lib/ → sole reader; registry session block after 18 pdca fires = {startedAt, onboardingCompleted, lastActivity}). In fork-mode sessions nothing else dispatches to `pdca-skill-stop.js`, so every in-handler advance (report→completed, envelope derivation) is unreachable code.

## Success criteria

1. A pdca skill fire writes `session.lastSkill` (and `session.lastAgent` symmetrically) to the registry alongside the existing `lastActivity` write in `lib/orchestrator/skill-invocation-effects.js`.
2. `getActiveSkill()` normalizes plugin-prefixed names (`'bkit:pdca'` → `'pdca'`) so the read matches the SKILL_HANDLERS key.
3. Regression test proves the chain: fire → registry `session.lastSkill` set → unified-stop dispatch reaches the pdca Stop handler.
4. Full battery green; br015 closed and archived.

## Scope

- `lib/orchestrator/skill-invocation-effects.js` — add writer
- `scripts/unified-stop.js` — add normalization at read
- `test-scripts/unit/` — new regression suite
- Out of scope: handler-internal logic (already fixed in br005a/br014)
