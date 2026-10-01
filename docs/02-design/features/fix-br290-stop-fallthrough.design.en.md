# fix-br290-stop-fallthrough — Design

**Date:** 2026-10-01 | **Selected:** Option C (guard at both binding sites via shared helper) | **BR:** br290

## Context Anchor

| Anchor | Content |
|---|---|
| WHY | Dead fire-time recording falls through to phantom primary → unstoppable post-completion Stop blocks. |
| WHO | Every session completing a PDCA cycle. |
| RISK | Over-guarding tier-0 live binding (br015b) or br006 primary fallback. |
| SUCCESS | Dead record → no binding; live record → tier-0; no record → primary fallback. |
| SCOPE | scripts/unified-stop.js + lib/pdca/stop-binding.js + 1 regression test. |

## Architecture Options

| Option | Shape | Trade-off |
|---|---|---|
| A — Inline fix at unified-stop.js only | Add one condition to the binding expression | Smallest diff, but resolveStopFeature keeps the same defect; two sources of truth. |
| B — Rewrite resolver as state machine | Restructure tiers into an explicit decision table | Cleanest long-term, large blast radius on the br015-proven path. |
| **C — Shared helper at both sites (selected)** | Export `isDeadRecordedFeature(recorded, features)` from stop-binding.js; guard the inline binding in unified-stop.js and tier 0 in resolveStopFeature | One semantic, both call sites; minimal diff; existing br015b tests remain the net. |

## Selected Design (Option C)

### New helper — lib/pdca/stop-binding.js

```js
// A fire-time recording naming a feature ABSENT from the registry is proof the
// cycle ran to completion (archive deletes the feature) — bind to nothing.
// Returns true only when `recorded` is a non-empty string that is not a key of
// `features`. Live recordings and absent recordings are both false.
function isDeadRecordedFeature(recorded, features) {
  return Boolean(recorded) && !(features && Object.prototype.hasOwnProperty.call(features, recorded));
}
```

### Call site 1 — lib/pdca/stop-binding.js `resolveStopFeature` tier 0

Current tier 0 validates the recorded feature and returns '' on miss. Change:
when `isDeadRecordedFeature(recorded, features)` is true, return a distinct
sentinel `null` meaning "dead record — bind to nothing" instead of continuing
to tiers 1–3. Callers receiving `null` skip all binding-driven actions (no
phase-transition directive, no completion message), exit 0 immediately.

### Call site 2 — scripts/unified-stop.js inline binding block

```js
const recorded = session?.lastSkillFeature || '';
const recordedDead = isDeadRecordedFeature(recorded, pdcaStatus?.features);
const feature = recordedDead ? null
  : (recorded && pdcaStatus?.features?.[recorded] && recorded) || pdcaStatus?.primaryFeature || null;
if (feature === null && recordedDead) {
  process.stdout.write(JSON.stringify({ decision: 'approve', reason: 'br290: fire-time feature completed (archived out) — nothing to advance' }));
  process.exit(0);
}
```

unified-stop.js already requires stop-binding.js (br015b wiring), so the helper import is additive.

## Data Flow

```
Stop → unified-stop.js
  ├─ session.lastSkillFeature present & LIVE   → tier-0 bind (unchanged, br015b)
  ├─ session.lastSkillFeature present & DEAD   → isDeadRecordedFeature → approve+exit (NEW)
  ├─ no recording, doc path matches            → tier-1 (unchanged)
  ├─ no recording, single feature in phase     → tier-2 (unchanged)
  └─ no recording                              → tier-3 primaryFeature (unchanged, br006)
```

## Test Plan

- test-scripts/regression/br290-dead-record-no-rebind.test.js (jest-native, spawn isolation like br288 test):
  - T1: registry with dead recorded feature + phantom primary → unified-stop binding resolves to no-bind (approve, no directive text).
  - T2: registry with live recorded feature → still binds (tier-0 intact).
  - T3: no recording + primary exists → primary still resolved (fallback intact).
- Mutation verification: remove the dead-record branch → T1 RED; restore → GREEN.
- Full jest battery green (existing stop-feature-binding suite covers T2/T3 already; keep them green).

## Implementation Guide

1. Add `isDeadRecordedFeature` to lib/pdca/stop-binding.js (+ export).
2. Guard resolveStopFeature tier 0 → return null sentinel on dead record; document sentinel in JSDoc.
3. Guard unified-stop.js inline binding block; early-approve on null+dead.
4. Write regression test (3 cases), run, mutation-verify.
5. Run full jest battery + eslint on touched files.
