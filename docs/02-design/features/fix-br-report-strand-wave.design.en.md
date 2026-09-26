# fix-br-report-strand-wave Design Document

> **Summary**: Fix the three open bug reports (br003/br005/br006) so PDCA cycles cannot strand: merge data.timestamps, bind the fired feature before primaryFeature fallback in the Stop handler, add a Task-independent report→completed transition, and let the archive gate's docs-on-disk arm accept bug-fix doc sets.
>
> **Project**: bkit-claude-code
> **Version**: 2.1.38 (do not bump)
> **Author**: dizzybeaver session
> **Date**: 2026-09-25
> **Status**: Draft
> **Planning Doc**: [fix-br-report-strand-wave.plan.en.md](../01-plan/features/fix-br-report-strand-wave.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Bug-fix cycles (skip check/qa) and fork-mode sessions (no Task system) cannot complete the PDCA lifecycle — the archive gate blocks forever (E-ARCH-GATE). |
| **WHO** | bkit consumers running PDCA cycles in CC v2.1.278+ fork-mode sessions; any caller passing timestamps to updatePdcaStatus. |
| **RISK** | Stop-handler changes touch the highest-traffic hook path; a regression mis-advances phases. Mitigation: pure helpers + unit tests both sides + mutation test. |
| **SUCCESS** | br003/br005/br006 fixed with failing-then-passing tests; full battery green; archive CLI gates a report-phase bug-fix feature via docs-on-disk. |
| **SCOPE** | lib/pdca/status-core.js, scripts/pdca-skill-stop.js, scripts/pdca-archive.js + tests; bug_reports closure; CHANGELOG entry. |

---

## 1. Overview

### 1.1 Design Goals

- Every Stop-handler registry write lands on the feature that was actually fired.
- No sanctioned transition depends on the CC Task system being present.
- No silent data loss in updatePdcaStatus (timestamps merge).
- The archive gate's rescue arm reflects real bug-fix cycle shapes (plan + design + report docs).

### 1.2 Design Principles

- Smallest correct change at each defect site — no refactors of working paths.
- Fail closed: new gates require positive evidence (skill marker AND doc on disk).
- Pure functions for new logic so tests need no hook harness.

---

## 2. Architecture Options

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic (Selected) |
|----------|:-:|:-:|:-:|
| **Approach** | 3 one-line patches in place | Extract a feature-binding + transition module | In-place fixes + small pure helpers near their consumers |
| **New Files** | 0 | 2-3 | 1 (pure helper file) |
| **Modified Files** | 3 | 5+ | 3-4 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium (logic inline) | High | High |
| **Effort** | Low | High | Medium |
| **Risk** | Low | Medium (big diff on hot path) | Low |

**Selected**: Option C — the binding logic and the report→completed clause are test-critical, so they become pure helpers in one new file (`lib/pdca/stop-binding.js`); the three defect sites get minimal edits that call them.

---

## 3. Detailed Design

### 3.1 FR-01 — br003: timestamps merge (lib/pdca/status-core.js)

Current (~line 260):

```js
timestamps: {
  ...status.features[feature].timestamps,
  lastUpdated: new Date().toISOString(),
},
```

Change:

```js
timestamps: {
  ...status.features[feature].timestamps,
  ...(data.timestamps || {}),
  lastUpdated: new Date().toISOString(),
},
```

`lastUpdated` stays last so its freshness guarantee is preserved. `data.timestamps` callers (lifecycle.archiveFeature) now land archivedAt.

### 3.2 FR-02 — br006: feature binding (scripts/pdca-skill-stop.js + new lib/pdca/stop-binding.js)

New pure helper `resolveStopFeature({ inputText, currentStatus, activeSkill })`:

1. If input text names a feature via doc-path templates (existing `featureFromDocPaths`) → use it (unchanged behavior).
2. Else, if the registry shows exactly one feature whose latest history entry is the phase matching this Stop's action (`activeSkill` from the skill-fire marker) → bind THAT feature. This is per-feature evidence: the misbind happened because the fallback skipped straight to `primaryFeature` when two features existed.
3. Else → `primaryFeature` (existing fallback, last resort).

`pdca-skill-stop.js` calls this helper at its single binding site (line ~82). The action passed in is the action resolved from the skill invocation text (not from phase), matching how the marker was written.

### 3.3 FR-03 — br005a: report→completed sanctioned write (scripts/pdca-skill-stop.js)

After the existing phase-recording logic, add a clause: when `action === 'report'` AND the report doc exists on disk for the bound feature (`findDoc('report', feature)` from lib/core/paths — the same check the archive CLI makes), call `updatePdcaStatus(feature, 'completed', {}, { requireDocs: false })`. This reuses the sanctioned write path; no registry hand-edit. The TaskCompleted hook path remains as-is where Tasks exist (it will simply be a no-op duplicate that writes the same phase).

Guard: only advance when the feature's current phase is `report` (never skip from earlier phases).

### 3.4 FR-04 — br005b: archive gate docs arm (scripts/pdca-archive.js)

Split REQUIRED_PHASES for the docs-on-disk arm only:

```js
const REQUIRED_PHASES = ['plan', 'design', 'analysis', 'report'];   // full cycle
const BUGFIX_DOCS = ['plan', 'design', 'report'];                   // docs-on-disk arm
```

The gate arm changes from `discoverDocs(feature).missing.length === 0` to: all of BUGFIX_DOCS present (analysis optional — present in full cycles, absent in bug-fix cycles). The final `discoverDocs` check before the actual move keeps using REQUIRED_PHASES minus analysis for bug-fix-shaped registries. Simplest correct form: change `REQUIRED_PHASES` to `['plan', 'design', 'report']` and keep `analysis` in OPTIONAL_PHASES — full cycles still archive (their analysis doc is archived when present), bug-fix cycles pass the gate.

### 3.5 Test Design (true tests)

- `test/unit/pdca-status-timestamps-merge.test.js` (br003): call updatePdcaStatus with `timestamps: { archivedAt }`; assert registry timestamps.archivedAt survives. RED on current code (field dropped), GREEN after.
- `test/unit/stop-binding.test.js` (br006): registry with two features (A=primaryFeature at phase do; B fired at report). Stop input names no doc paths. Assert helper returns B, not A. Mutation check: revert binding order → test must go RED.
- `test/unit/stop-report-completion.test.js` (br005a): feature at phase=report with report doc on disk; run the completion clause; assert phase=completed written via updatePdcaStatus. Also assert NO advance when doc is missing.
- `test/contract/pdca-archive-bugfix-gate.test.js` (br005b): temp registry with feature at phase=report, plan/design/report docs on disk, no analysis doc. Dry-run archive → gate passes with `gate: 'docs-on-disk'`. RED on current code.

### 3.6 Bug-report closure (FR-05)

- br006 placeholders filled with measured mechanism (root cause cites scripts/pdca-skill-stop.js:82 → extractFeatureFromContext → status-core.js:438 primaryFeature fallback; impact: cross-feature phase advance; fix: 3.2; verification: test + live Stop).
- All three files moved to `bug_reports/completed/BR/<name>.completed.md`; INDEX.md Open section emptied, Recently Closed updated.

### 3.7 CHANGELOG (FR-06)

New `### Fixed` entries under `## [Unreleased]` — one line per br — no version changes.

---

## 4. Error Handling

- `resolveStopFeature` returns '' (never throws) when no evidence exists — downstream keeps today's behavior.
- The report→completed clause wraps updatePdcaStatus in existing try/catch pattern used by the Stop handler (hook must never crash the session).
- Archive CLI gate change keeps fail-closed semantics: phases below report never pass.

---

## 5. Test Plan Summary

| Level | What | Where |
|-------|------|-------|
| L1 unit | timestamps merge, stop binding, report completion clause | test/unit/*.test.js |
| L1 contract | archive gate bug-fix shape | test/contract/*.test.js |
| Mutation | binding-order revert → RED | recorded in report |
| Live | one real Stop after a report fire → registry transition observed | main session, post-Do |

---

## 6. Implementation Guide

### 6.1 Module Map

| Module | Items |
|--------|-------|
| module-1: status-core timestamps | 3.1 + test 3.5a |
| module-2: stop binding + report completion | 3.2, 3.3 + tests 3.5b, 3.5c |
| module-3: archive gate | 3.4 + test 3.5d |
| module-4: closure | 3.6, 3.7 (bug reports, INDEX, CHANGELOG) |

### 6.2 Session Guide

Single session covers all four modules (small, same subsystem). Order: module-1 → module-3 → module-2 → module-4 (lowest-risk first, binding last since it's the hot path).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-25 | Initial draft | dizzybeaver session |
