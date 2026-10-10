# br045-close-registry-junk Completion Report

> **Summary**: Close BR-045 per bug_reports/instructions.md and purge registry junk rows via sanctioned lib/pdca APIs — 9 items removed, zero open BR reports, ZfeatA resurrection root-caused.
>
> **Author**: report-generator (bkit)
> **Created**: 2026-10-10
> **Status**: Complete
> **PDCA Cycle**: §45.9 janitorial lane

---

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|------|---------|
| Feature | br045-close-registry-junk |
| Cycle | pm → plan → design → do (2 rounds) → report |
| Completed | 2026-10-10 |
| Effort | pm-lead (~105K), MAIN plan/design in-session, warm fix agent 2 rounds (~414K), MAIN verification |

### 1.2 Results Summary

```
┌─────────────────────────────────────────────┐
│  Completion Rate: 100%                       │
├─────────────────────────────────────────────┤
│  ✅ Complete:      3 / 3 work units          │
│  ⏳ In Progress:   0 / 3 (carry items =      │
│     operator decisions, not defects)         │
└─────────────────────────────────────────────┘
```

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | BR-045 was resolved in code but the report sat open in `bug_reports/active/br/`, and the PDCA registry carried 9 junk rows (test fixtures, dict-only prompt-string variants, doc-materialized phantoms). |
| **Solution** | In-session re-verification + Resolution addendum + move to `completed/BR/` per instructions.md; all 9 registry removals through the two sanctioned APIs (`cleanupOrphanActiveFeatures`, `deleteFeatureFromStatus`) — never a file write. |
| **Function/UX Effect** | Registry dict reduced to 15 clean keys; junk dict rows 0; status view free of ZfeatA and long prompt-string variants; INDEX shows zero open BR reports. |
| **Core Value** | Registry and bug-report lifecycle now reflect reality — future phases read clean state instead of inheriting noise; the resurrection mechanism is documented so it cannot silently recur. |

### 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---------|:------:|----------|
| SC-1 | BR-045 closed per instructions.md (verify, Resolution addendum, move, INDEX swap) | ✅ Met | Re-verification probes `true true false`, level 4; file at `bug_reports/completed/BR/br045-scope-limiter-l0-poisoned-control-state.completed.md` |
| SC-2 | Registry junk removed via sanctioned APIs only | ✅ Met | 9 items removed; no direct registry file writes (G-020 respected) |
| SC-3 | End-state verified: clean view, zero open BR reports | ✅ Met | MAIN probes: junk dict rows 0; view ZfeatA false, long variants 0; dict 15 clean keys; active/br empty |

**Success Rate**: 3/3 criteria met (100%)

### 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|--------|----------|:---------:|---------|
| [Plan] | Registry edits only via `lib/pdca` APIs, never file writes | ✅ | All 9 removals API-mediated |
| [Design] | Orphan cleanup (`cleanupOrphanActiveFeatures`) removes the 5 expected rows | ❌ | Main finding — see §6.2; agent correctly reported variance instead of improvising |
| [Design] | Dict-only junk needs `deleteFeatureFromStatus` by exact key (BR-001 orphan path) | ✅ | 6 dict-only variants + 1 stray removed this way |
| [Do] | Warm fix agent, 2 rounds, variance-report-not-improvise | ✅ | Round 2 caught the stray `fix-br060-065-audit-pdca` under the end-state criterion |

---

## 2. Related Documents

| Phase | Document | Status |
|-------|----------|--------|
| PM | [br045-close-registry-junk.prd.en.md](../../00-pm/br045-close-registry-junk.prd.en.md) | ✅ Finalized |
| Plan | [br045-close-registry-junk.plan.en.md](../01-plan/features/br045-close-registry-junk.plan.en.md) | ✅ Finalized |
| Design | [br045-close-registry-junk.design.en.md](../02-design/features/br045-close-registry-junk.design.en.md) | ✅ Finalized |
| Report | Current document | ✅ Complete |

---

## 3. Completed Items

### 3.1 Work Units

| ID | Item | Status | Notes |
|----|------|--------|-------|
| WU-1 | Close BR-045 per bug_reports/instructions.md | ✅ Complete | Probes `true true false` (level 4); `## Resolution` addendum; moved to `completed/BR/`; INDEX Open→Recently Closed swap. **Zero open BR reports now.** |
| WU-2 | Registry junk removal (9 items) | ✅ Complete | `cleanupOrphanActiveFeatures` → ZfeatA (activeFeatures array); `deleteFeatureFromStatus` (reason "orphan-removed (docs missing)") → test-feature, test-feature-sync, test-module-chain, 4 long fix-br060-065 dict-only variants, 1 short `fix-br060-065-audit-pdca` stray |
| WU-3 | ZfeatA view-resurrection root cause | ✅ Complete | `getPdcaStatusView` materialized it from `docs/03-analysis/features/ZfeatA.analysis.md` (fixture-written); backed up to `work/backups/janitor-round2/` then deleted |

### 3.2 Verification (MAIN-executed)

| Check | Result |
|-------|--------|
| Junk dict rows | 0 |
| Status view: ZfeatA | false (absent) |
| Status view: long prompt-string variants | 0 |
| Registry dict keys | 15, all clean |
| `bug_reports/active/br/` | empty |
| Completed file + INDEX swap | verified |

---

## 4. Incomplete Items

### 4.1 Carry Items (operator decides)

| Item | Reason | Priority |
|------|--------|----------|
| ~60 old doc-evidenced features populate the view's active list | Each backed by real phase docs in `docs/01-plan|02-design|03-analysis/features/` from unarchived historical cycles; archiving is a separate decision | Medium |
| G-019 false-positives on read-only command strings containing the registry path | 2 hits this cycle, both rephrased around; tool-side fix decision | Low |

### 4.2 Cancelled/On Hold Items

| Item | Reason | Alternative |
|------|--------|-------------|
| - | - | - |

---

## 5. Quality Metrics

| Metric | Target | Final |
|--------|--------|-------|
| Success criteria met | 3/3 | 3/3 (100%) |
| Junk registry rows | 0 | 0 |
| Open BR reports | 0 | 0 |
| Registry API violations (direct file writes) | 0 | 0 |

---

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

- **Variance-report-not-improvise worked exactly as intended.** When the fix agent's round 1 did not match MAIN's design expectation (5 removed by orphan cleanup), it reported the variance instead of improvising — which surfaced the two-layer root cause below.
- All registry mutations went through the sanctioned APIs; zero direct file writes.
- The stray `fix-br060-065-audit-pdca` was caught by the agent applying the end-state criterion, not just the itemized list.

### 6.2 What Needs Improvement (Problem) — TEACHING FINDINGS

- **The registry has TWO layers.** The `features` dict and the `activeFeatures` array are separate structures: `cleanupOrphanActiveFeatures` filters ONLY the array. Dict-only junk rows (fixtures, prompt-string variants) need `deleteFeatureFromStatus` by exact key. MAIN's design expectation ("5 removed by orphan cleanup") was wrong for this reason — design docs for registry work must model both layers.
- **`getPdcaStatusView` materializes features from phase docs on disk.** Deleting a registry row without deleting its backing phase doc means the view resurrects it on next read (ZfeatA case, from a fixture-written `docs/03-analysis/features/ZfeatA.analysis.md`). Registry cleanup and doc cleanup must be paired operations.

### 6.3 What to Try Next (Try)

- Registry-cleanup design briefs should always enumerate target keys AND their backing docs in one table.
- Consider a lib/pdca helper that removes a feature row + its phase docs atomically.

---

## 7. Next Steps

### 7.1 Immediate

- [ ] Operator decision: archive/cleanup the ~60 historical doc-evidenced features
- [ ] Operator decision: G-019 false-positive handling (tool-side report or rule adjustment)

### 7.2 Next PDCA Cycle

| Item | Priority | Expected Start |
|------|----------|----------------|
| Historical cycle archiving sweep | Medium | Operator decides |
| G-019 read-only-string FP fix | Low | Operator decides |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-10 | Completion report created | report-generator (bkit) |
