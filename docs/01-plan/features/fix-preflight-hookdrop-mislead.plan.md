# fix-preflight-hookdrop-mislead Planning Document

> **Summary**: Disambiguate the session-start CC-version preflight warning so it can no longer be misread as "your CC version causes hook drops", and annotate the #57317 reachability warning with fresh-stamp evidence so a downstream session cannot cite it as the cause of registry stalls.
>
> **Project**: bkit-claude-code
> **Version**: 2.1.38 (maintainer assigns release version)
> **Author**: dizzybeaver (agent-executed)
> **Date**: 2026-09-19
> **Status**: Approved (L4 auto-checkpoints, AskUserQuestion banned by operator directive)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | A consuming session (python_infrastructure, 2026-09-19) read bkit's two independent session-start warnings — the permanent `fork-default-agent-spawn` known-issue line and the (already-suppressed-when-healthy) #57317 reachability warning — as a single causal chain: "CC 2.1.278 > recommended 2.1.220 ⇒ plugin hooks are dropping ⇒ registry stops advancing." It then mimicked the check/report phases via direct agent dispatch, stranded its registry at `qa`, and filed br004 blaming a hook drop. Transcript forensics (closed br004b) proved hooks were healthy (canary stamps live) and the real cause was skipped skill fires. The warning wording manufactures a false causal bridge between a version advisory and hook health. |
| **Solution** | Two precise wording/mechanics changes, no behavior redesign: (1) the KNOWN_ISSUES advisory in `lib/infra/cc-version-checker.js` gains an explicit "This is NOT a hook failure; hooks and skill fires are unaffected — see hook-reachability check for hook health" clause; (2) the hook-reachability warning in `hooks/session-start.js` gains self-verification guidance (name the evidence file, state that fresh canary stamps mean hooks are firing, and point at missing `/pdca <phase>` fires as the likely cause when a registry stalls while canaries are fresh). |
| **Function/UX Effect** | Session-start output keeps the same two-warning shape (no new noise); each warning now closes its own causal door. A future agent diagnosing a stalled registry reads "canaries healthy ⇒ hooks fine ⇒ look at whether phase fires actually happened" instead of "version newer than recommended ⇒ hooks dropped." |
| **Core Value** | Warnings that name the wrong culprit cost a full misdiagnosis cycle (br004 filed, operator time, PDCA strand). This fix makes the preflight layer self-disambiguating so the same mistake cannot recur. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Two independent advisories were fused by a reader into one false causal chain, producing a wrong bug report and a stranded PDCA cycle |
| **WHO** | Any downstream Claude session consuming bkit's session-start preflight output to diagnose registry/archive failures |
| **RISK** | Wording change alone may still be misread; mitigated by evidence-anchored text (file paths, canary semantics) plus regression tests locking the exact message content |
| **SUCCESS** | Regression tests pass asserting both new clauses render; live probe shows warnings present and correctly worded; CI gates green; PDCA archived |
| **SCOPE** | Wording changes in 2 files + tests + CHANGELOG; no state-machine, gate, or hook-dispatch logic changes |

---

## 1. Overview

### 1.1 Purpose

The session-start preflight emits, on CC v2.1.278:

1. `⚠️ CC v2.1.278: fork mode is on by default and the Agent tool loses its run_in_background parameter. bkit recommends v2.1.220; run /bkit or see docs/06-guide/cc-compatibility.guide.md for the mitigation.` — from `renderCCVersionWarning` ([hooks/startup/preflight.js:67-71](hooks/startup/preflight.js#L67-L71)) drawing on `KNOWN_ISSUES` (`fork-default-agent-spawn`, [lib/infra/cc-version-checker.js:103-138](lib/infra/cc-version-checker.js#L103-L138)).
2. When reachability stamps are stale: `⚠️ bkit hook reachability check: missing=[...] stale=[...]. CC plugin-hook drop (#57317) suspected...` — from [hooks/session-start.js:447](hooks/session-start.js#L447).

A consuming session fused these into "2.1.278 > 2.1.220 means hooks are dropping," which is false on every link: 2.1.220 is a floor (`compareVersion(current, RECOMMENDED_VERSION) < 0` doesn't even fire at 2.1.278), the fork issue concerns only Agent-tool `run_in_background` semantics, and the #57317 monitor was already fixed (#126, commit `7b780b8`) to suppress the warning unless canaries corroborate.

### 1.2 Background

Full forensic chain: closed br004b (`bug_reports/completed/BR/br004b-stop-handler-phase-advancement-drops.invalid-workflow-deviation.completed.md`). Registry `lastUpdated` equaled the last real skill fire; canary stamps (`bash_post` 21:14, `write_post` 18:26) proved hooks live throughout. The misdiagnosis cost: one invalid bug report, one stranded feature, one operator round-trip.

### 1.3 Related Documents

- Closed report: `bug_reports/completed/BR/br004b-stop-handler-phase-advancement-drops.invalid-workflow-deviation.completed.md`
- `lib/core/hook-reachability.js` (#126 rationale)
- `lib/infra/cc-version-checker.js` KNOWN_ISSUES contract (entry rules in header comment)
- `docs/06-guide/cc-compatibility.guide.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] FR-01: `fork-default-agent-spawn` KNOWN_ISSUES `detail` (and rendered summary path) gains an explicit non-causality clause: not a hook failure; version-vs-recommended comparison is not evidence of hook drops; hooks/skill fires unaffected.
- [ ] FR-02: `renderCCVersionWarning` known-issues branch text keeps its shape but the `detail` it can draw from carries the clause (FR-01) — no second copy of the text.
- [ ] FR-03: hook-reachability warning ([hooks/session-start.js:447](hooks/session-start.js#L447)) gains: the evidence file path (`.bkit/runtime/hook-reachability.json`), the canary-corroboration semantics ("a real drop takes down bash_post/write_post too"), and the diagnostic pointer ("if stamps are fresh and a PDCA registry is stalled, suspect missing `/pdca <phase>` skill fires, not hook drops").
- [ ] FR-04: Regression tests asserting both rendered messages contain the new disambiguation clauses (message-content locks, pattern of `test/unit/hook-reachability.test.js`).
- [ ] FR-05: CHANGELOG entry (unreleased heading per maintainer policy) documenting the fix.

### 2.2 Out of Scope

- Any change to gate logic, phase state machine, archive conditions, or hook dispatch.
- Removing or changing `RECOMMENDED_VERSION` or the `fork-default-agent-spawn` entry's existence.
- Retrofitting the consuming python_infrastructure project (recovery there is firing the skipped phases, documented in br004b).
- Bilingual `.ko.md` siblings for the new plan/design docs — no, per project rule these ARE required for new `docs/` files. In scope: `.en.md` + `.ko.md` pairs for plan/design/analysis/report.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | KNOWN_ISSUES `fork-default-agent-spawn.detail` ends with: "This is a subagent-spawn semantics change only — it is NOT a hook failure. bkit hooks (PreToolUse/PostToolUse/Stop) are unaffected; a higher-than-recommended CC version is not evidence of hook drops." | High | Pending |
| FR-02 | No duplicate wording: `renderCCVersionWarning` continues to compose from the report object; only `detail`/summary fields change. | Medium | Pending |
| FR-03 | Reachability warning text becomes: `⚠️ bkit hook reachability check: missing=[...] stale=[...]. CC plugin-hook drop (#57317) suspected — evidence: .bkit/runtime/hook-reachability.json (a real drop takes bash_post/write_post canaries down too; fresh canary stamps mean hooks are FIRING — if a PDCA registry is stalled while canaries are fresh, suspect skipped /pdca <phase> skill fires, not a hook drop). See docs/sprint/v2114 MON-CC-NEW-PLUGIN-HOOK-DROP.` | High | Pending |
| FR-04 | Unit tests lock: (a) `renderCCVersionWarning` known-issue output includes "NOT a hook failure"; (b) reachability warn message includes "skill fires" pointer and evidence path. | High | Pending |
| FR-05 | CHANGELOG `## [Unreleased]` entry. | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Compatibility | No message-consumers break (grep for old strings first) | `grep -rn` old warning text across repo + tests |
| Safety | Warning paths stay fail-open; no new throw sites | Existing hook-reachability + preflight test suites |
| Trust | Warning shape unchanged (2 lines max each) | Manual read of live probe output |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01/02/03 implemented in repo
- [ ] FR-04 tests written, green, registered in `test/run-all.js` if new files
- [ ] FR-05 CHANGELOG entry present
- [ ] Bilingual doc pairs (.en/.ko) for all new docs/ files
- [ ] CI gates (check-domain-purity, check-guards, docs-code-sync, check-test-tracking) green
- [ ] Sync to installed plugin cache `~/.claude/plugins/cache/bkit-marketplace/bkit/2.1.38/`
- [ ] PDCA cycle completed through archive; committed to remote branch

### 4.2 Quality Criteria

- [ ] Zero new lint errors on changed files
- [ ] Full unit battery green (no pre-existing regressions)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Old warning strings asserted in existing tests break | Low | Medium | Grep all test/consumer references before editing; update assertions deliberately |
| Longer warning re-misleads differently | Low | Low | Evidence-anchored phrasing (file path + canary semantics) is checkable by a reader in one probe |
| CI docs-code-sync flags CHANGELOG heading | Low | Medium | Use `## [Unreleased]` — scanVersions skips provisional headings (br004/1st fix) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/infra/cc-version-checker.js` | Lib module | `detail` string of 1 KNOWN_ISSUES entry gains non-causality clause |
| `hooks/session-start.js` | Hook | Reachability warn message string gains evidence + diagnostic pointer |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| KNOWN_ISSUES detail | READ | `checkCCVersion()` → report.knownIssues → `renderCCVersionWarning` (preflight.js:67-71 uses `summary` only) | None — summary unchanged; detail surfaces via `/bkit` detail paths |
| KNOWN_ISSUES detail | READ | docs/06-guide cc-compatibility (prose) | None — prose references, no string match |
| Reachability warnMsg | READ | session-start.js only (composes additionalContext) | None — leaf string |
| Old string assertions | READ | tests asserting warning text (to enumerate in Do) | Needs verification — update assertions |

### 6.3 Verification

- [x] All consumers listed verified via grep (Do phase re-verifies test assertions)
- [ ] No behavioral change beyond string content

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Existing project conventions (bkit repo layout: `lib/`, `hooks/`, `scripts/`, `test/`). No level selection applies — this is the bkit plugin repo itself.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Where the clause lives | (a) summary string in preflight renderer (b) detail in checker data (c) both | (b) detail in checker data | Single source; renderer composes; summary (the line shown) is drawn from summary field — Decision: put clause in the SUMMARY since that is what downstream sessions actually see; detail carries the long form |
| Message length | Terse vs explicit | Explicit-but-bounded (2 lines) | The failure mode IS underspecification; a terse nudge already failed once |
| Test strategy | Snapshot vs assertion | Content assertions | Matches existing test idiom (hook-reachability.test.js) |

**Correction (binding)**: FR-01 amended — the non-causality clause goes into the KNOWN_ISSUES `summary` (rendered line) in compact form, with the full form in `detail`. The rendered warning is what the python_infrastructure session actually read.

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] ESLint v10.11.0 flat config — run on changed files
- [x] Conventional Commits (`fix:` prefix)
- [x] Bilingual docs policy (`.en.md`/`.ko.md` siblings, new docs only)

### 8.2 Conventions to Define/Verify

None new — existing conventions suffice.

### 8.3 Environment Variables Needed

None.

---

## 9. Next Steps

1. [ ] Design document (`fix-preflight-hookdrop-mislead.design.md`, en+ko)
2. [ ] Do: implement wording + tests + CHANGELOG
3. [ ] Check → QA → Report → Archive → commit + push

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-19 | Initial draft (L4 auto-approved) | dizzybeaver (agent) |
