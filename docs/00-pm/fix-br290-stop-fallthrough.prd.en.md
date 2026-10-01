# fix-br290-stop-fallthrough — Problem PRD

**Date:** 2026-10-01 | **Type:** Bug-fix cycle | **BR:** br290

## Problem

After a PDCA cycle completes and its feature is removed from the registry at archive, `session.lastSkillFeature` still names the dead feature. The Stop handler's binding treats a dead recorded feature identically to no recording, falling through to `primaryFeature` — here a leftover probe fixture (ZfeatA, phase=plan, zero documents). Every post-completion Stop re-fires the fixture's phase transition ("Plan document has been generated → execute /pdca design ZfeatA"), blocking the turn and pressuring the agent to fabricate a phantom cycle. Observed 9 consecutive Stop blocks on 2026-10-01.

## Evidence

- `session.lastSkillFeature = "fix-br288-terminal-guard"` (dead — archived out of registry this morning)
- `primaryFeature = "ZfeatA"` (fixture: phase=plan, docs=0, created 2026-09-26 during br015 probe work)
- Binding expression (scripts/unified-stop.js:326-335): `(recorded && features[recorded] && recorded) || primaryFeature || null`

## Success criteria

1. A Stop whose fire-time feature is recorded but dead binds to NOTHING — no transition block, registry untouched.
2. Live recorded feature still binds tier-0 (no regression to br015b).
3. No recording at all still falls back to primaryFeature (br006 behavior preserved).
4. Mutation-verified regression test; full jest battery green.

## Out of scope

- Purging the docless phantom fixtures from the live registry (no sanctioned removal path; surfaced to operator in br290).
- br287's all-archived stale-acknowledgement mechanism (separate report).
