# br287-br289-fixes Planning Document

> **Summary**: Verify and close two already-committed bug fixes (br287 stale PDCA-COMPLETE loop; br289 eslint jest globals), update CHANGELOG, and deliver branch to GitHub without any merge to main.
>
> **Project**: bkit-claude-code
> **Author**: dizzybeaver (Claude Code loop)
> **Date**: 2026-10-14
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | br287: the PDCA skill-stop hook re-emitted PDCA-COMPLETE on every later Stop for a feature that was already archived (terminal), blocking turn ends indefinitely. br289: eslint.config.js never declared jest globals, so every describe/it/expect in test-scripts was a no-undef error (210 errors). |
| **Solution** | Both fixes already landed in commit 44060a9 (br287: terminal-feature early exit in scripts/pdca-skill-stop.js; br289: jest globals override block in eslint.config.js). This cycle verifies both fixes against the live system, closes the reports, and completes the delivery workflow. |
| **Function/UX Effect** | Stops after cycle completion approve silently; lint over test-scripts reports 0 errors. No runtime behavior changes beyond the two fixes. |
| **Core Value** | Loop hygiene: the operator's Stop is never hijacked by a finished cycle, and lint output is actionable. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Two open bug reports whose fixes are committed but not closed out — reports, CHANGELOG, and delivery workflow remain. |
| **WHO** | bkit plugin maintainers and CI (contract-check runs eslint; operator's Stop flow runs unified-stop/skill-stop hooks). |
| **RISK** | Closing reports without re-verifying on current code (verification drift); pushing to the wrong remote/branch; accidental merge to main. |
| **SUCCESS** | Both reports moved to completed/ with .completed markers; CHANGELOG updated; all tests pass; branch fix/patches_102026 pushed to GitHub origin; no PR, no merge to main. |
| **SCOPE** | Verify both fixes → close 2 reports → CHANGELOG → commit → run tests/workflows → push branch to origin. |

---

## 1. Overview

### 1.1 Purpose

Resolve the two open bug reports in `bug_reports/active/br/` (br287, br289) and complete the operator's delivery workflow: local commits, full test run, branch push to GitHub — explicitly NO pull request and NO merge to main or upstream main.

### 1.2 Background

Commit 44060a9 ("fix(pdca): br287/br289/br292 — terminal-stop silence, eslint jest globals, config self-lint") landed both code fixes, but the reports were never closed and CHANGELOG lacks entries. The /loop directive requires the full closure workflow.

### 1.3 Related Documents

- br287: `bug_reports/active/br/br287-unified-stop-stale-complete-loop.md`
- br289: `bug_reports/active/br/br289-eslint-jest-globals-missing.md`
- CHANGELOG.md, CONTRIBUTING.md, `.github/workflows/`

---

## 2. Scope

### 2.1 In Scope

- [ ] Re-verify br287 fix on current code (terminal-feature predicate vs live registry)
- [ ] Re-verify br289 fix on current code (eslint run over test-scripts)
- [ ] Move both reports to `bug_reports/completed/BR/` with `.completed.md` markers, filling Fix/Verification fields
- [ ] Add CHANGELOG entries for both fixes
- [ ] Commit locally on fix/patches_102026
- [ ] Run all tests (jest battery + eslint)
- [ ] Push fix/patches_102026 to origin (GitHub)

### 2.2 Out of Scope

- Any pull request or merge to main / upstream main (operator directive)
- br292 (already closed in 44060a9)
- The `ZfeatA` junk primaryFeature row (noted; separate decision)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | br287 fix verified on present code with fresh evidence | High | Done (verified this session) |
| FR-02 | br289 fix verified with fresh eslint run (0 errors) | High | Done (verified this session) |
| FR-03 | Reports closed per bug-reporting.md (11 fields, .completed marker) | High | Pending |
| FR-04 | CHANGELOG entries added (version-heading as unreleased labeling per project rule) | Medium | Pending |
| FR-05 | Branch pushed to origin; no PR; no merge to main | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Verification | All claims carry fresh command output | Transcript evidence |
| Git hygiene | Clean tree after commits; no co-author trailers | git status / git log |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Both reports in completed/ with .completed markers and real verification evidence
- [ ] CHANGELOG updated
- [ ] Full test battery passes (0 FAIL)
- [ ] eslint clean (0 errors)
- [ ] fix/patches_102026 pushed to origin

### 4.2 Quality Criteria

- [ ] No registry hand-edits (all phase writes via skill fires)
- [ ] No linting suppressions introduced

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Verification drift (fixes verified in prior session only) | High | Medium | Re-verify in this session (done: predicate probe + eslint run) |
| Accidental push to main or PR creation | High | Low | Explicit `git push origin fix/patches_102026` only; no `gh pr create` |
| Registry gate blocks archive | Medium | Low | Follow archive CLI dry-run → apply; surface errors, no workaround |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| bug_reports (2 files) | Docs | Move active → completed |
| CHANGELOG.md | Docs | New entries |
| PDCA docs (4) | Docs | Plan/design/report for this cycle + archive |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| scripts/pdca-skill-stop.js | READ (hook runtime) | Every Stop with active skill | None — already committed and live |
| eslint.config.js | READ (CI + local lint) | contract-check workflow | None — already committed |

### 6.3 Verification

- [x] Fix code is in HEAD (44060a9) and verified fresh this session
- [x] eslint: 0 errors over test-scripts
- [x] Terminal predicate: all 16 archived registry entries correctly flagged terminal

---

## 7. Architecture Considerations

Not applicable — no new code. Both fixes' architecture is documented in commit 44060a9 and the inline comments at scripts/pdca-skill-stop.js:452 and eslint.config.js:153.

---

## 8. Convention Prerequisites

- [x] CHANGELOG.md exists — entries added under unreleased-style heading (version numbers are maintainer's; per project CLAUDE.md)
- [x] CONTRIBUTING.md read — commit message conventions followed
- [x] Bilingual docs rule — this plan emitted as .en.md + .ko.md

---

## 9. Next Steps

1. [ ] Design document
2. [ ] Do: close reports + CHANGELOG
3. [ ] Report → archive → commit → test → push

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-14 | Initial draft | Claude Code loop |
