# fix-preflight-hookdrop-mislead Completion Report

> **Status**: Complete (archive in progress — runs after this report; remote push operator-directed)
>
> **Project**: bkit-claude-code
> **Version**: 2.1.38 (maintainer assigns release version)
> **Author**: dizzybeaver (agent-executed)
> **Completion Date**: 2026-09-19
> **PDCA Cycle**: fix/misc_fixes_972026

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | A consuming session fused bkit's two independent session-start warnings into "CC 2.1.278 > recommended 2.1.220 ⇒ plugin-hook drops (#57317) ⇒ registry stalled at qa," then mimicked check/report via direct agent dispatch — producing invalid bug report br004 and a stranded PDCA cycle. Transcript forensics (closed br004b) proved hooks healthy (fresh canary stamps); the real cause was skipped `/pdca <phase>` skill fires. |
| **Solution** | Reworded both warnings so each closes its own causal door: KNOWN_ISSUES `fork-default-agent-spawn` gained explicit non-causality clauses in summary + detail; the hook-reachability warning was rewritten with evidence file path, canary semantics, and a "suspect skipped /pdca skill fires" diagnostic pointer (commit b0f0533). |
| **Function/UX Effect** | Warnings disambiguated 2/2 with unchanged two-warning shape (no new noise); 4 new content-locked tests, 36/36 targeted suites pass, full unit battery 1984 TC ALL PASS; live probe renders both clauses. A future agent now reads "canaries fresh ⇒ hooks fine ⇒ check phase fires" instead of "newer version ⇒ hooks dropped." |
| **Core Value** | Warnings that name the wrong culprit cost a full misdiagnosis cycle (br004, operator time, stranded PDCA). The preflight layer is now self-disambiguating and mutation-verified, so the same mistake cannot recur. |

### 1.3 Value Delivered

- **Warnings disambiguated**: 2/2 (CC-version advisory + hook-reachability warning)
- **Tests**: 4 new TC (registered run-all.js:171), 36/36 targeted PASS, 1984 full-battery TC ALL PASS
- **Check match rate**: 100% (Structural/Functional/Contract all 100); gap list 2 Minor, both accepted
- **QA**: QA_PASS — mutation RED/GREEN proven, cache 3/3 identical, live probe all assertions hold, CI gates green

---

## 1.4 Success Criteria Final Status

> From Plan §4.1 Definition of Done.

| # | Criteria | Status | Evidence |
|---|---------|:------:|----------|
| SC-1 | FR-01/02/03 implemented (both warnings reworded) | ✅ Met | b0f0533; analysis §1 Structural 100% |
| SC-2 | FR-04 tests green + registered | ✅ Met | test/unit/preflight-hookdrop-disambiguation.test.js 4/4; run-all.js:171 |
| SC-3 | FR-05 CHANGELOG `[Unreleased]` entry | ✅ Met | CHANGELOG.md:8-19 |
| SC-4 | Bilingual doc pairs (.en/.ko) for all new docs | ✅ Met | plan/design/analysis/report pairs exist |
| SC-5 | CI gates green (purity/guards/docs-sync/test-tracking) | ✅ Met | reported green on bugfix wave incl. b0f0533 |
| SC-6 | Plugin-cache sync | ✅ Met | QA diff: 3/3 IDENTICAL |
| SC-7 | Zero new lint errors | ✅ Met | ESLint v10.11.0 clean (52bf736) |
| SC-8 | Full unit battery green | ✅ Met | 1984 TC ALL PASS (main session) |
| SC-9 | PDCA through archive; pushed to remote | ⏳ | Archive runs after this report; push operator-directed |

**Success Rate**: 8/9 met; 1 in progress (SC-9 archive/push, by design at report time)

## 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|--------|----------|:---------:|---------|
| [Plan] | Non-causality clause in both KNOWN_ISSUES summary (compact) and detail (full) | ✅ | Both render; T-01 locks it; live probe confirms |
| [Design] | Option C — in-place string edits + content-locked tests, no shared constants module | ✅ | Single-source-per-message preserved; contract 100% |
| [Design] | Extract `buildReachabilityWarning(missing, stale, reachFile)` for testability | ✅ (location deviation) | Extracted to lib/core/hook-reachability.js, NOT hooks/session-start.js — session-start.js has no main-guard and exits (`process.exit(0)`), unsafe to require from tests. Documented; signature/text/consumers match design exactly. Accepted as Minor gap #1. |

---

## 2. Related Documents

| Phase | Document | Status |
|-------|----------|--------|
| Plan | [fix-preflight-hookdrop-mislead.plan.md](../../01-plan/features/fix-preflight-hookdrop-mislead.plan.md) | ✅ Finalized |
| Design | [fix-preflight-hookdrop-mislead.design.md](../../02-design/features/fix-preflight-hookdrop-mislead.design.md) | ✅ Finalized |
| Check | [fix-preflight-hookdrop-mislead.analysis.en.md](../../03-analysis/features/fix-preflight-hookdrop-mislead.analysis.en.md) | ✅ 100% |
| QA | [fix-preflight-hookdrop-mislead.qa-report.en.md](../../05-qa/fix-preflight-hookdrop-mislead.qa-report.en.md) | ✅ QA_PASS |
| Act | Current document | ✅ Complete |
| Closed forensics | `bug_reports/completed/BR/br004b-...completed.md` | ✅ Closed |

---

## 3. Completed Items

| ID | Item | Status | Evidence |
|----|------|--------|----------|
| FR-01 | KNOWN_ISSUES non-causality clauses (summary + detail) | ✅ | cc-version-checker.js:123-125, 134-137 |
| FR-02 | No duplicate wording; renderer composes from checker data | ✅ | preflight.js:68 maps `i.summary` unchanged |
| FR-03 | Reachability warning rewrite (evidence path + canary rule + skill-fires pointer) | ✅ | hook-reachability.js:114-119; session-start.js:450 |
| FR-04 | 4 content-assertion regression TCs, registered | ✅ | run-all.js:171; mutation RED/GREEN proven |
| FR-05 | CHANGELOG `[Unreleased]` entry | ✅ | CHANGELOG.md:8-19 |

---

## 4. Incomplete Items

| Item | Reason | Priority | Owner |
|------|--------|----------|-------|
| PDCA archive | Sanctioned archive CLI runs after this report | High | /pdca archive |
| Remote push | Operator-directed next step | High | Operator |

---

## 5. Quality Metrics

| Metric | Target | Final |
|--------|--------|-------|
| Design Match Rate | ≥90% | 100% (static-only: S100/F100/C100) |
| Targeted suites | pass | 36/36 |
| New TC | registered | 4/4 |
| Full unit battery | green | 1984 TC ALL PASS |
| Mutation verification | RED/GREEN | proven (T-01/T-02 RED on mutant; GREEN restored) |
| Cache sync | identical | 3/3 files |
| Critical/Important gaps | 0 | 0 |

## 5.2 Resolved Issues

| Issue | Resolution | Result |
|-------|------------|--------|
| Misleading fused causal chain | Non-causality clauses in both warnings | ✅ Locked by tests |
| Untestable inline warnMsg | Builder extracted to lib/core/hook-reachability.js | ✅ Test-importable |

---

## 6. Lessons Learned

### 6.1 What Went Well
- Evidence-anchored wording (file paths + canary semantics) is checkable by any reader in one probe.
- Mutation verification (RED/GREEN) proved the new tests are true tests, not bypass-passes.
- Small scope kept zero logic changes — no regressions in the 1984 TC battery.

### 6.2 What Needs Improvement
- Design §4.4 sketched the builder inside session-start.js without checking its main-guard/exit behavior — caught at Do, cost a declared deviation.
- The misdiagnosis itself: warning wording lacked causal doors until a consuming session burned a full cycle on it (br004).

### 6.3 What to Try Next
- When designing string-extraction for tests, verify module top-level behavior (guards, exit) before writing the design section.
- Audit remaining KNOWN_ISSUES entries for the same misread potential (T-01's regex scales to future entries).

---

## 7. Next Steps

- Run `/pdca archive fix-preflight-hookdrop-mislead` (CLI, dry-run then --apply).
- Operator: push branch fix/misc_fixes_972026 to remote.
- Optional: fold the builder-location deviation note into the design doc at archive time.

---

## 9. Changelog

### Fixed
- Session-start preflight warnings no longer support the false "version > recommended ⇒ hook drops" chain: explicit non-causality clauses in the `fork-default-agent-spawn` advisory, and the hook-reachability warning now cites its evidence file, canary semantics, and the "skipped /pdca skill fires" diagnostic pointer (b0f0533).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-09-19 | Completion report created | dizzybeaver (agent) |
