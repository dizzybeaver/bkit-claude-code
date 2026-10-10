# qa-aggregate-red-fixes Planning Document

> **Summary**: Fix the 6 red qa-aggregate assertions (5 root causes) so branch fix/patches_102026 passes the contract-check CI gate.
>
> **Project**: bkit-claude-code (bkit Vibecoding Kit v2.1.40)
> **Version**: 2.1.40
> **Author**: dizzybeaver (main session)
> **Date**: 2026-10-10
> **Status**: Draft
> **Lane**: §45.9 bug-fix cycle (pm → plan → design → do → report → archive; gap/iterate/qa skipped — Do's own evidence is the verification)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | CI pre-run (2026-10-10) shows qa-aggregate RED: 6 failing assertions across 8 files (7158 PASS / 6 FAIL / 7166 TC). The branch cannot merge with a red aggregate gate. |
| **Solution** | Five targeted fixes, each verified root-caused: add 2 missing `@version` tags, repoint 1 regression test at the post-split implementation file, update 1 stale doc module count, update 1 stale MCP read-tool expectation, flip 1 stale assertion to the deliberate br105 behavior. |
| **Function/UX Effect** | Contract-check CI returns to fully green (24/24 steps); no runtime behavior changes — 4 of 5 fixes are test/doc-side only. |
| **Core Value** | The aggregate gate regains its meaning: it fails only on real regressions, not on drift between shipped code and stale test/doc expectations. |

---

## Context Anchor

> Auto-generated from Executive Summary. Propagated to Design/Do documents for context continuity.

| Key | Value |
|-----|-------|
| **WHY** | qa-aggregate gate is red on fix/patches_102026 (6 assertions / 5 roots), blocking CI merge. |
| **WHO** | Maintainer (dizzybeaver) + CI contract-check pipeline. |
| **RISK** | Expectation updates could paper over a real regression — every flip must cite the verified current-reality evidence (which side is wrong). |
| **SUCCESS** | SC-1 `node test/contract/scripts/qa-aggregate.js` exits 0, 0 FAIL. SC-2 24-step contract-check pre-run all green. |
| **SCOPE** | 5 fixes / 6 files: 2 lib headers, 3 test files, 1 doc count. No runtime logic changes. |

---

## 1. Overview

### 1.1 Purpose

Restore the qa-aggregate contract gate to green on `fix/patches_102026` by fixing the 6 failing assertions introduced by the branch's own commits (br050 `_io` split, MCP tool growth, lib growth, br105 enforcement change).

### 1.2 Background

The 2026-10-10 contract-check pre-run (all 24 workflow steps executed locally, same commands/order as CI) passed 23/24. Step 18 (`qa-aggregate.js`) failed: 6 assertions, 8 files, 7166 TC. All 5 root causes trace to this branch's commits or to deliberate earlier decisions whose tests were never updated.

### 1.3 Related Documents

- Requirements: [qa-aggregate-red-fixes PRD](../../00-pm/qa-aggregate-red-fixes.prd.en.md)
- Evidence: local pre-run logs (`/tmp/ccrun-17.log` summary: 7158/6/7166)

---

## 2. Scope

### 2.1 In Scope

- [ ] R1: `@version` JSDoc tags on `lib/core/io.js` and `lib/core/_io/shared.js`
- [ ] R2: repoint `test/regression/enh-433-hook-output-visibility.test.js` at `lib/core/_io/output.js`
- [ ] R3: update lib module count in `AI-NATIVE-DEVELOPMENT.md` (203 → actual)
- [ ] R4: update MCP read-tool expectation in `test/contract/mcp-port.test.js` (13 → verified actual) after enumerating the tool inventory
- [ ] R5: flip EN-06 in `tests/qa/v2114-defense-memory-enforcer.test.js` to assert br105 behavior (content field excluded from enforcement haystack)

### 2.2 Out of Scope

- Any other red/stale assertion not in the 6-failure set (discovered mid-fix → bug_reports per verification-scope rule)
- Runtime logic changes to `lib/defense/memory-enforcer.js` (code is deliberately correct per br105)
- ZfeatA / test-feature registry junk cleanup (separate concern, noted)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Add `* @version 2.1.40` to JSDoc headers of `lib/core/io.js`, `lib/core/_io/shared.js` (pattern: `lib/core/_io/output.js:7`) | High | Pending |
| FR-02 | `enh-433` test reads `lib/core/_io/output.js` (where `STDOUT_REACHES_MODEL` lives at line 70) instead of the re-export wrapper `lib/core/io.js` | High | Pending |
| FR-03 | `AI-NATIVE-DEVELOPMENT.md` lib module count matches actual repository count (verified via the CI-INV check's own counter: 207) | High | Pending |
| FR-04 | `mcp-port.test.js` read-tool count matches the enumerated MCP tool inventory (actual 16; comment updated to name the reads) | High | Pending |
| FR-05 | EN-06 asserts `allowed === true` for directive text present ONLY in `content` field, with comment citing br105; companion assertion that same text in `command`/`args` still denies (already covered by EN-07) | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Correctness | No runtime behavior change (FR-01/02/03/04/05 are headers/tests/doc only) | git diff scope review |
| True tests | Each flipped expectation cites verified current reality, not convenience | Reviewer + re-run |
| Process | Testing handoff: fix agent builds only; MAIN runs all tests | Protocol compliance |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] All FR-01..FR-05 implemented
- [ ] SC-1: `node test/contract/scripts/qa-aggregate.js` exit 0, 0 FAIL (MAIN-executed)
- [ ] SC-2: 24-step contract-check pre-run all green (MAIN-executed)
- [ ] Report + archive phases complete

### 4.2 Quality Criteria

- [ ] Zero lint errors on touched files
- [ ] Bilingual doc rule respected (plan/design/report as .en.md/.ko.md pairs)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Expectation flips mask real regressions (FR-04/FR-05) | High | Medium | Fixer MUST verify which side is wrong before editing: enumerate MCP reads from source; read br105 comment + git history for EN-06. Pre-digested evidence already in the Do brief. |
| `@version` tag format drift (FR-01) | Low | Low | Copy exact pattern from `lib/core/_io/output.js:7`. |
| Sibling assertions in same suites still red after fixes | Medium | Medium | MAIN re-runs full aggregate after fix wave; any new failure → second dispatch to the SAME agent (testing-handoff loop). |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/core/io.js`, `lib/core/_io/shared.js` | Lib module headers | Add `@version` JSDoc tag (comment-only) |
| `test/regression/enh-433-hook-output-visibility.test.js` | Regression test | Read path → `_io/output.js` |
| `AI-NATIVE-DEVELOPMENT.md` | Doc | Module count 203 → 207 |
| `test/contract/mcp-port.test.js` | Contract test | Expected reads 13 → 16 |
| `tests/qa/v2114-defense-memory-enforcer.test.js` | QA test | EN-06 assertion flip + comment |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `lib/core/io.js` header | comment | all `require('./io')` / `require('../core/io')` consumers | None (comment-only) |
| enh-433 test | READ | CI aggregate + qa-aggregate.js | Green |
| CI-INV count check | READ | component-inventory.test.js | Green |
| mcp-port check | READ | mcp-port.test.js | Green |
| EN-06 | READ | v2114 suite | Green |

### 6.3 Verification

- [ ] All consumers listed above verified via SC-1/SC-2 runs (MAIN-executed)
- [ ] No runtime code path touched

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Existing Enterprise-level Clean Architecture plugin codebase — N/A (no new structure).

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Fix shape | Test-side vs code-side per finding | Test/doc-side for all 5 | Code is verified deliberately correct in each case (br105, _io split, tool growth); tests/docs drifted. |

---

## 8. Convention Prerequisites

- Header tags follow existing JSDoc `@version` convention (SoT: `lib/core/_io/output.js`)
- Bilingual `.en.md`/`.ko.md` siblings for all new docs/ files (project rule)
- No Co-Authored-By trailers (operator standing rule)

---

## 9. Next Steps

1. [x] PRD (pm phase) — done 2026-10-10
2. [ ] Write design document (`qa-aggregate-red-fixes.design.{en,ko}.md`)
3. [ ] Do phase: one scoped fix agent (6 files, exclusive scope, 10-min deadline)
4. [ ] MAIN runs SC-1/SC-2
5. [ ] Report + archive

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
