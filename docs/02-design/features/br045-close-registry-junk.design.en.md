# br045-close-registry-junk Design Document

> **Summary**: Exact procedural design — report-close steps + two sanctioned registry API calls with evidence capture. Option A (procedural, no code).
>
> **Project**: bkit-claude-code (v2.1.40) · **Date**: 2026-10-10 · **Status**: Draft
> **Planning Doc**: [plan](../../01-plan/features/br045-close-registry-junk.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | br045 open-but-fixed + 8 junk registry rows — state lies to every consumer. |
| **WHO** | Maintainer, PDCA dashboards, future sessions' primaryFeature resolution. |
| **RISK** | API orphan-guard refusal → report blocked, never force. |
| **SUCCESS** | SC-1 catalog closed; SC-2 registry readback clean; SC-3 status view + hook smoke healthy. |
| **SCOPE** | 1 report close (procedure) + 2 API calls + readback. No lib/ changes. |

---

## 2. Architecture — Option A (procedural)

Verified facts anchoring the design:
- Both APIs are real exports: `lib/pdca/index.js:72` (deleteFeatureFromStatus), `:81` (cleanupOrphanActiveFeatures).
- `cleanupOrphanActiveFeatures()` removes active rows failing `isValidFeatureName` via locked RMW (br030), records a `junk_active_feature_cleaned` history entry, re-picks primaryFeature if needed.
- `deleteFeatureFromStatus(name)` honors the BR-001 sanctioned orphan path: active + non-terminal + no plan/design docs on disk → deletable.
- The closing procedure (bug_reports/instructions.md): re-verify in-session → `## Resolution` addendum → `mv` to `completed/BR/*.completed.md` → INDEX row swap.

## 8. Test Plan (MAIN-executed)

| Check | Method |
|-------|--------|
| SC-2 probes re-run (close-procedure step 1) | `checkPathScope('tests/x.js',2)` / `('README.md',2)` allowed; `('tests/x.js',0)` denied; control-state currentLevel still 4 |
| SC-1 | `ls bug_reports/active/br/` (no br045) + completed file exists + Resolution present + INDEX rows correct |
| SC-2 | registry readback: 8 junk names absent, `br045-scope-advisory-fixes` + other legit rows intact, primaryFeature real |
| SC-3 | `getPdcaStatusView()` loads; hook smoke (`node scripts/pre-write.js` dry or lib status read) error-free |

## 11. Implementation Guide (exact steps for the Do agent)

| # | Step | Detail |
|---|------|--------|
| 1 | Re-verify (evidence for addendum) | Run the 4 SC-2 scope probes + read control-state currentLevel; capture output verbatim |
| 2 | Append `## Resolution` to br045 report | What changed (commit 9c599e8, 10-suite sandbox + allowlist fix), verification evidence from step 1 |
| 3 | Move | `mv bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md bug_reports/completed/BR/br045-scope-limiter-l0-poisoned-control-state.completed.md` |
| 4 | INDEX swap | Remove the br045 row under `## Open`; prepend under `## Recently Closed`: `- br045-scope-limiter-l0-poisoned-control-state.completed.md — allowlist tiers + 10-suite state-write sandboxing; L0 advisories gone (Medium; closed 2026-10-10, fix-br045-scope-advisory-fixes)` |
| 5 | Registry cleanup A | `node -e "const r=require('./lib/pdca').cleanupOrphanActiveFeatures(); console.log(JSON.stringify(r))"` — expect removed = 5 entries (4 long fix-br060-065 variants + ZfeatA) |
| 6 | Registry cleanup B | `node -e "for (const n of ['test-feature','test-feature-sync','test-module-chain']) console.log(n, JSON.stringify(require('./lib/pdca').deleteFeatureFromStatus(n)))"` — expect success per call; any refusal → leave + report blocked |
| 7 | Readback | Registry JSON readback listing activeFeatures + primaryFeature |

### 11.2 Order: 1→7 sequential. 11.3 Session: module-1, one agent dispatch.

## Version History

| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
|-----|------------|---------------|-------------|
