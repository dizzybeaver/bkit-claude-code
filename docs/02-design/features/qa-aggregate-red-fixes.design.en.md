# qa-aggregate-red-fixes Design Document

> **Summary**: Exact edit design for the 5 root-cause fixes restoring the qa-aggregate gate to green — test/doc/header-side only, zero runtime changes.
>
> **Project**: bkit-claude-code (bkit Vibecoding Kit v2.1.40)
> **Version**: 2.1.40
> **Author**: dizzybeaver (main session)
> **Date**: 2026-10-10
> **Status**: Draft
> **Planning Doc**: [qa-aggregate-red-fixes.plan.md](../../01-plan/features/qa-aggregate-red-fixes.plan.en.md)

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | qa-aggregate gate is red on fix/patches_102026 (6 assertions / 5 roots), blocking CI merge. |
| **WHO** | Maintainer (dizzybeaver) + CI contract-check pipeline. |
| **RISK** | Expectation updates could paper over a real regression — every flip must cite the verified current-reality evidence. |
| **SUCCESS** | SC-1 `node test/contract/scripts/qa-aggregate.js` exits 0, 0 FAIL. SC-2 24-step contract-check pre-run all green. |
| **SCOPE** | 5 fixes / 6 files: 2 lib headers, 3 test files, 1 doc count. No runtime logic changes. |

---

## 1. Overview

### 1.1 Design Goals

- Turn the 6 red assertions green with the smallest possible verified diffs.
- Each edit cites which side was verified wrong (code or expectation) before flipping.

### 1.2 Design Principles

- Test/doc-side only: runtime code is verified deliberately correct in all 5 cases.
- Pre-digested evidence: every fix below carries file:line and the verification already performed by MAIN on 2026-10-10.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Option | Description | Complexity | Maintainability | Effort | Risk | Selected |
|--------|-------------|-----------|-----------------|--------|------|:--------:|
| **A — Minimal Changes** | Point edits at the 6 files; no restructuring | Very low | High (matches existing patterns) | ~1h | Low | ✅ |
| **B — Clean Architecture** | Introduce a generated expectations/SoT module consumed by all 5 suites | High | High long-term, but over-engineered for a fix wave | ~1d | Medium (new coupling) | ☐ |
| **C — Pragmatic Balance** | A + extract shared module-count helper for CI-INV | Medium | Medium | ~3h | Low | ☐ |

**Selection: Option A** (Checkpoint 3 resolved by work.md operating-level-4 no-interactive rule; Option A is also the objectively correct size for a defect-fix lane — B/C are feature-scale responses to drift whose real fix is process, not structure).

---

## 3. Data Model — N/A (no data changes)

## 4. API Specification — N/A (no API changes)

## 5. UI/UX Design — N/A (no UI)

---

## 6. Error Handling — N/A (no new error paths; all edits are static)

---

## 7. Security Considerations

None of the edits touch enforcement code. FR-05 asserts the *deliberate narrowing* of `enforce()` (br105): directive text in `content` is quotation, not execution — the security posture of the deny path for `command`/`file_path`/`args` is unchanged and still covered by EN-07.

---

## 8. Test Plan

### 8.1 Test Scope

| Level | Scope | Runner |
|-------|-------|--------|
| L1 (contract aggregate) | SC-1: `node test/contract/scripts/qa-aggregate.js` — exit 0, 0 FAIL | MAIN (testing handoff) |
| L2 (CI parity) | SC-2: full 24-step contract-check sequence, same commands/order as `.github/workflows/contract-check.yml` | MAIN |

### 8.2 Per-Fix Acceptance

| Fix | Suite(s) that must turn green |
|-----|-------------------------------|
| FR-01 | `test/contract/v2112-deep-qa-invariants.contract.test.js` (L3-006), `tests/qa/v2112-deep-qa-fixes.test.js` (L1-016) |
| FR-02 | `test/regression/enh-433-hook-output-visibility.test.js` |
| FR-03 | `test/contract/component-inventory.test.js` (CI-INV ×2) |
| FR-04 | `test/contract/mcp-port.test.js` |
| FR-05 | `tests/qa/v2114-defense-memory-enforcer.test.js` (EN-06) |

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment

All edits live in existing layers: lib headers (`lib/core/`), tests (`test/`, `tests/qa/`), docs (`AI-NATIVE-DEVELOPMENT.md`). No new modules, no import changes.

---

## 10. Coding Convention Reference

- JSDoc `@version` tag pattern: copy from `lib/core/_io/output.js:7`
- No Co-Authored-By trailers; English-only code/comments

---

## 11. Implementation Guide

### 11.1 File Structure (exact edits)

| # | File | Edit |
|---|------|------|
| 1 | `lib/core/io.js` | Add `* @version 2.1.40` line inside the existing top JSDoc block (after the `Design Ref: br050` line's block, matching `output.js` placement convention) |
| 2 | `lib/core/_io/shared.js` | Add `* @version 2.1.40` inside its top JSDoc block |
| 3 | `test/regression/enh-433-hook-output-visibility.test.js` | Change the source path read for the STDOUT_REACHES_MODEL assertion (line ~107 context) from `lib/core/io.js` to `lib/core/_io/output.js`; keep assertion text unchanged |
| 4 | `AI-NATIVE-DEVELOPMENT.md` (line 198) | `lib/ (203 modules)` → `lib/ (207 modules)` — first re-verify actual count via the component-inventory checker's own counter |
| 5 | `test/contract/mcp-port.test.js` (lines 152-153) | Enumerate actual read tools from MCP server sources first; if and only if 16 confirmed, `assert.equal(reads.length, 13)` → `16` and update the `// 10 pdca read + 3 analysis read = 13` comment to name the real breakdown |
| 6 | `tests/qa/v2114-defense-memory-enforcer.test.js` (EN-06, lines 121-126) | Flip `assert.equal(r.allowed, false)` → `assert.equal(r.allowed, true)`; rename test to `EN-06: enforce ignores content field (br105)`; comment citing br105 (content = quotation, not execution); denial still asserted by EN-07 |

### 11.2 Implementation Order

Single pass, one scoped agent: fixes 1-2 (headers) → 3 → 4 → 5 → 6. No interdependencies.

### 11.3 Session Guide

| Module | Files | Session |
|--------|-------|---------|
| module-1 (all) | the 6 files above | 1 session (~10 min agent dispatch) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
