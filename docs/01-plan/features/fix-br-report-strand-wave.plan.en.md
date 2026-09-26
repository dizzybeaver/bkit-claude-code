# fix-br-report-strand-wave Planning Document

> **Summary**: Resolve the three open bug reports (br003/br005/br006) that share one symptom family — PDCA cycles stranding at `report` and failing the archive gate — by fixing timestamp merging, Stop-handler feature binding, and the report→completed transition + archive gate's docs-on-disk arm.
>
> **Project**: bkit-claude-code
> **Version**: 2.1.38 (do not bump)
> **Author**: dizzybeaver session
> **Date**: 2026-09-25
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Three open defects strand PDCA cycles: (br003) `updatePdcaStatus` silently drops `data.timestamps`; (br006) the pdca-skill Stop handler binds the WRONG feature when hook input lacks the feature name, advancing `primaryFeature` instead; (br005) report→completed transition depends on a Task system fork-mode sessions lack, and the archive gate's docs-on-disk rescue arm requires an `analysis` doc that bug-fix cycles never produce. |
| **Solution** | Fix each root cause: merge `data.timestamps` in status-core; bind the feature from the active skill-fire marker (per-feature registry evidence) before falling back to `primaryFeature`; give the Stop handler a Task-independent report→completed path; make `analysis` a non-required phase doc for the docs-on-disk gate arm. |
| **Function/UX Effect** | Cycles complete and archive cleanly in fork-mode sessions; registry timestamps (archivedAt etc.) record correctly; phases land on the feature that was actually fired, not `primaryFeature`. |
| **Core Value** | The PDCA bookkeeping system becomes self-consistent: every sanctioned phase fire observable by the Stop handler results in the correct registry transition, with no permanent E-ARCH-GATE strand. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Bug-fix cycles (skip check/qa) and fork-mode sessions (no Task system) currently cannot complete the PDCA lifecycle — the archive gate blocks forever (E-ARCH-GATE). |
| **WHO** | bkit consumers running PDCA cycles in CC v2.1.278+ fork-mode sessions (no Task tools); any caller passing `timestamps` to `updatePdcaStatus`. |
| **RISK** | Stop-handler changes touch the highest-traffic hook path; a regression mis-advances phases. Mitigation: pure helpers + unit tests + live Stop observation. |
| **SUCCESS** | br003/br005/br006 fixed with failing-then-passing tests; full battery green; archive CLI gates a report-phase feature on docs-on-disk. |
| **SCOPE** | lib/pdca/status-core.js, scripts/pdca-skill-stop.js, scripts/pdca-archive.js + tests; bug_reports updates; CHANGELOG entry. |

---

## 1. Overview

### 1.1 Purpose

Close all three open bug reports in `bug_reports/active/br/` and any pre-existing/out-of-scope defects found during the work, per the operator directive.

### 1.2 Background

- **br003** (Low): `lib/pdca/status-core.js` `updatePdcaStatus` spreads `...data` but then rebuilds `timestamps` from the existing record + `lastUpdated` only — `data.timestamps` never merges. `archiveFeature` in `lib/pdca/lifecycle.js` passes `timestamps: { archivedAt: now }` and it is silently dropped.
- **br006** (High): `scripts/pdca-skill-stop.js` calls `extractFeatureFromContext({ agentOutput, currentStatus })`. When the Stop hook input text does not name the feature's document paths, `featureFromDocPaths` returns '' and the helper falls back to `currentStatus.primaryFeature`. With a foreign `primaryFeature` (e.g. sima-kg-port while tools-agents-blocks was fired), `updatePdcaStatus` advances the wrong feature. Root-cause fields in br006 are placeholders — this cycle fills them with measured mechanism (file:line).
- **br005** (High): the report phase doc says report→completed advances "via the TaskCompleted hook when the `[Report] {feature}` Task is marked completed". Fork-mode CC v2.1.278+ sessions have no Task tools, so nothing fires. Additional root cause found this cycle: the archive CLI's docs-on-disk gate arm (`scripts/pdca-archive.js:131`) requires `REQUIRED_PHASES = ['plan','design','analysis','report']` — bug-fix cycles skip Check, so `analysis` is always missing and the rescue arm can never pass.

### 1.3 Related Documents

- Bug reports: `bug_reports/active/br/br003-*.md`, `br005-*.md`, `br006-*.md`
- Index: `bug_reports/active/br/INDEX.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] FR-01 (br003): merge `data.timestamps` into the existing timestamps object in `updatePdcaStatus`.
- [ ] FR-02 (br006): bind the Stop handler's feature from active per-feature skill-fire evidence (registry `features` keyed by phase marker / doc-path match already present in input) BEFORE falling back to `primaryFeature`; fill br006's placeholder root-cause/impact/fix/verification fields with measured mechanism.
- [ ] FR-03 (br005a): Stop handler advances report→completed when the report-phase skill fire is observed AND the report doc exists on disk for the SAME bound feature (Task-system-independent sanctioned write).
- [ ] FR-04 (br005b): archive CLI docs-on-disk arm must not require `analysis` unconditionally — bug-fix cycles (no check phase) archive on plan+design+report docs.
- [ ] FR-05: update all three bug reports to `.completed` status (moved to `bug_reports/completed/BR/`), update INDEX.md.
- [ ] FR-06: CHANGELOG.md entry under `[Unreleased]` (no version bump).
- [ ] FR-07: any out-of-scope or pre-existing defect discovered mid-cycle: file a br/rb report AND fix it in this cycle (root-cause-first rule).

### 2.2 Out of Scope

- Version bumps (maintainer-owned per project CLAUDE.md).
- Rewriting the Task-system path (it stays as the primary transition mechanism where Tasks exist).
- Registry hand-edits (G-020 denies them; all writes go through sanctioned APIs).

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `updatePdcaStatus` merges `data.timestamps` over existing timestamps | High | Pending |
| FR-02 | Stop handler binds fired feature before primaryFeature fallback | High | Pending |
| FR-03 | Task-independent report→completed sanctioned write | High | Pending |
| FR-04 | Archive gate docs-on-disk arm accepts bug-fix doc sets (no analysis) | High | Pending |
| FR-05 | Bug reports closed + INDEX updated | Medium | Pending |
| FR-06 | CHANGELOG entry (no version bump) | Medium | Pending |
| FR-07 | Out-of-scope finds: file + fix in-cycle | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | Stop hook stays well under the 5 s budget | existing hook-cost probes |
| Compatibility | No registry schema change; v3 status format preserved | test suite |
| Safety | All mutations via sanctioned lib APIs only | code review + G-020 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Each fix has a test that FAILS on the pre-fix code (true test) and PASSES after
- [ ] Full test battery green (main agent runs it; testing-handoff protocol)
- [ ] All three bug reports moved to completed with 9-field content filled (br006 placeholders replaced with measured mechanism)
- [ ] Archive CLI dry-run gates a simulated report-phase bug-fix feature via docs-on-disk
- [ ] CHANGELOG updated under [Unreleased]; no version field touched

### 4.2 Quality Criteria

- [ ] Lint clean on all touched files
- [ ] No new bare excepts / lint suppressions
- [ ] Mutation check on the FR-02 fix (wrong-feature bind must go RED)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Stop-handler regression mis-advances phases | High | Medium | Pure helper extraction + unit tests both sides + mutation test |
| report→completed auto-advance fires spuriously (doc exists but report not really done) | Medium | Low | Require BOTH the report-phase active-skill marker in the Stop input AND the doc on disk — same condition the archive CLI checks |
| Analysis-doc relaxation lets genuinely incomplete full cycles archive | Medium | Low | Full cycles still have check phase recorded in registry; gate uses docs-on-disk only as a rescue arm below `completed` |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/pdca/status-core.js` (updatePdcaStatus) | lib API | timestamps merge |
| `scripts/pdca-skill-stop.js` | hook script | feature binding + report→completed auto-advance |
| `scripts/pdca-archive.js` | CLI | REQUIRED_PHASES handling for docs-on-disk arm |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| updatePdcaStatus | WRITE | lib/pdca/lifecycle.js archiveFeature (timestamps) | Fixed (dropped → merged) |
| updatePdcaStatus | WRITE | all phase Stop handlers | None (merge is additive) |
| extractFeatureFromContext | READ | scripts/pdca-skill-stop.js, scripts/analysis-stop.js | Binding order change — verify existing callers |
| REQUIRED_PHASES | READ | scripts/pdca-archive.js discoverDocs/gate | Relaxation of one arm; completed/matchRate arms unchanged |

### 6.3 Verification

- [ ] All consumers verified via full battery
- [ ] Live Stop observation after fix (one real phase fire)

---

## 7. Architecture Considerations

### 7.1 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| report→completed writer | TaskCompleted hook only / Stop-handler clause / archive-gate acceptance | Stop-handler clause (+ gate already has docs arm) | Stop handler already records transitions; same skill-marker evidence it already reads |
| timestamps merge | spread order change / explicit merge | explicit `{...existing, ...data.timestamps, lastUpdated}` | Preserves lastUpdated freshness guarantee |
| feature binding | input-only / registry-marker-first | registry-marker-first with doc-path corroboration | Marker is per-feature and cannot fall back silently |

---

## 8. Convention Prerequisites

- [x] ESLint config exists; lint must pass on touched files
- [x] Test setup exists (test/unit, test/contract, tests/qa)
- [x] Conventional Commits; no co-author trailer

---

## 9. Next Steps

1. [ ] Design document (`fix-br-report-strand-wave.design.md`)
2. [ ] Implementation via testing-handoff protocol (build agent builds, main tests)
3. [ ] Report + archive, bug-report closure, CHANGELOG, sync to GitHub, plugin update

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-25 | Initial draft | dizzybeaver session |
