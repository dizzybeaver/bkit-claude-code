# br045-close-registry-junk Planning Document

> **Summary**: Close the fixed-but-open br045 report per the catalog procedure and remove the 8 verified junk rows from the PDCA registry — both strictly through sanctioned paths.
>
> **Project**: bkit-claude-code (v2.1.40) · **Author**: dizzybeaver (main session) · **Date**: 2026-10-10 · **Status**: Draft
> **Lane**: §45.9 bug-fix/janitorial cycle

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | br045 is fixed+verified but still sits open in `active/br/`; the PDCA registry carries 8 junk activeFeatures rows (fixture debris + prompt-string pollution) polluting dashboards and primary-feature selection. |
| **Solution** | Execute the documented closing procedure for br045 (re-verify → Resolution addendum → move to completed/BR → INDEX swap), and remove the 8 rows via the two exported lifecycle APIs (cleanupOrphanActiveFeatures for the 5 name-invalid, deleteFeatureFromStatus for the 3 doc-less orphans). |
| **Function/UX Effect** | Bug catalog shows the true open set (zero open BRs); session dashboards stop surfacing ZfeatA/junk as the primary feature. |
| **Core Value** | Registry and catalog regain audit-truthfulness; all mutations stay on sanctioned, history-recording paths. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | br045 open-but-fixed + 8 junk registry rows — state lies to every consumer. |
| **WHO** | Maintainer, PDCA dashboards, future sessions' primaryFeature resolution. |
| **RISK** | API orphan-guard refusal (guard disagrees with our orphan judgment) → report blocked, never force. |
| **SUCCESS** | SC-1 catalog closed correctly; SC-2 registry readback clean (8 gone, legitimate rows intact); SC-3 status view + hook smoke healthy. |
| **SCOPE** | 1 report close (procedure) + 2 API calls + readback. No lib/ changes, no new tooling. |

---

## 2. Scope

### 2.1 In Scope
- [ ] R1: br045 close per bug_reports/instructions.md procedure (in-session re-verification, `## Resolution` addendum, move → `completed/BR/br045-*.completed.md`, INDEX row swap)
- [ ] R2: `cleanupOrphanActiveFeatures()` — removes the 5 name-invalid rows (4 `fix-br060-065` prompt-string variants + `ZfeatA`)
- [ ] R3: `deleteFeatureFromStatus(name)` × 3 — `test-feature`, `test-feature-sync`, `test-module-chain` (BR-001 sanctioned orphan path)
- [ ] R4: post-cleanup registry readback (junk gone, `br045-scope-advisory-fixes` & other legit rows intact, primaryFeature resolves to a real feature)

### 2.2 Out of Scope
- Archived-feature history rows (legitimate summaries; `/pdca cleanup` is a separate operator decision)
- Any lib/pdca code change; any new tooling; bug_reports renumbering

---

## 3. Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Close procedure steps 1-4 exactly as written in instructions.md (incl. real re-verification output in the addendum — SC-2 probes re-run) | High | Pending |
| FR-02 | API-only registry writes (cleanupOrphanActiveFeatures, deleteFeatureFromStatus); capture each call's return value as evidence | High | Pending |
| FR-03 | If any API refuses an entry, leave it and report blocked (no forcing, no hand-edit) | High | Pending |

---

## 4. Success Criteria

- [ ] SC-1: `bug_reports/active/br/` has no br045 file; `completed/BR/br045-scope-limiter-l0-poisoned-control-state.completed.md` exists with a `## Resolution` section carrying real re-verification output; INDEX updated (Open row removed, Recently Closed row prepended)
- [ ] SC-2: registry readback — none of the 8 junk names present; legitimate features intact; primaryFeature is a real feature (or null with no active junk)
- [ ] SC-3: pdca status view loads cleanly + one hook smoke (e.g. `node --check` free read of status via lib) passes

---

## 5. Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Orphan guard refuses test-feature* (docs check disagrees) | Medium | Low | Report blocked; entries stay; surfaced to operator |
| Battery fixtures re-create junk rows later | Medium | Medium | Separate root (fixture sandbox class already fixed for control-state; ZfeatA's creating fixture is a registry writer — one-line carry note if it recurs) |

---

## 7. Architecture — Option A (procedural; no code)

## 9. Next Steps
1. [x] PRD 2. [ ] Design 3. [ ] Do (scoped agent) 4. [ ] MAIN verifies SC-1..3 5. [ ] Report + archive

---

## Version History

| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
|-----|------------|---------------|-------------|
