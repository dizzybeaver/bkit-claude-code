# fix-br290-stop-fallthrough — Plan

**Date:** 2026-10-01 | **Type:** Bug-fix cycle (pm → plan → design → do → report → archive) | **BR:** br290

## Executive Summary

| Perspective | Summary |
|---|---|
| Problem | A recorded fire-time feature that no longer exists (archived out of the registry) falls through the Stop-handler binding to `primaryFeature` — here a docless probe fixture (ZfeatA) — re-firing phantom phase transitions on every post-completion Stop. |
| Solution | Dead-recorded-feature guard: when `session.lastSkillFeature` is set but absent from `features`, bind to nothing (post-completion stop). Fallback to `primaryFeature` only when nothing was recorded. |
| Function/UX Effect | No more unstoppable "proceed to the next phase" blocks after a cycle completes; the operator's turn ends cleanly. |
| Core Value | A fire-time recording is per-invocation evidence — its death is proof of completion, not absence of evidence. |

## Context Anchor

| Anchor | Content |
|---|---|
| WHY | 9 consecutive Stop blocks observed 2026-10-01; phantom "execute /pdca design ZfeatA" pressure after the br288 cycle archived. |
| WHO | Any session that completes and archives a PDCA cycle (every future cycle hits this). |
| RISK | Over-guarding could break live tier-0 binding (br015b) or the br006 primary fallback. |
| SUCCESS | Dead record → no binding, no transition block; live record → tier-0 unchanged; no record → primary fallback unchanged. |
| SCOPE | scripts/unified-stop.js binding block + lib/pdca/stop-binding.js tier 0 + one regression test. |

## Requirements

- R1: `resolveStopFeature` and the inline binding in unified-stop.js must distinguish "no recording" from "recording names a dead feature".
- R2: Dead recording → return '' / bind null; caller emits no phase-transition directive.
- R3: Preserved behaviors: live recording binds tier-0; doc-path match (tier 1); single-feature-in-phase (tier 2); primaryFeature fallback only when nothing recorded (tier 3).
- R4: Regression test, mutation-verified (guard removed → test RED). Full jest battery green.

## Success Criteria

| # | Criterion | Evidence |
|---|---|---|
| SC1 | Dead record + phantom primary → resolveStopFeature returns '' | unit test asserts '' |
| SC2 | Live record still binds | existing stop-feature-binding suite stays green |
| SC3 | No record + primary exists → primary returned | unit test asserts fallback intact |
| SC4 | Mutation RED / restore GREEN | stash guard → RED; pop → GREEN |

## Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Guard breaks legit cross-session resume (feature alive but registry reloaded) | Guard keys on absence from `features` — an alive feature is present, so unaffected. |
| Caller sites diverge (two binding expressions) | Fix both sites; single helper exported from stop-binding if the inline block can import it. |

## Next Steps

/design → /do (guard + test) → /report → /archive
