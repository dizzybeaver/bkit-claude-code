# qa-aggregate-red-fixes — Defect-Fix PRD

**Version:** 1.0
**Date:** 2026-10-10
**Purpose:** Resolve the 6 failing qa-aggregate gate assertions on branch `fix/patches_102026` so CI passes
**Category:** PDCA PM phase — bug-fix lane (work/work.md §45.9). This file is the SoT; the `.ko.md` sibling is a translation.

---

## 1. Executive Summary

| Perspective | Summary |
|---|---|
| Problem | CI pre-run of `.github/workflows/contract-check.yml` is RED: 6 failing assertions across 8 files (7158 PASS / 6 FAIL / 7166 TC), from 5 root defects left by recent waves (br050 io split, lib growth, MCP port growth, one undiagnosed behavioral change). |
| Value | Restores the green CI baseline so the branch is mergeable and the contract-check pre-run is trustworthy again. |
| Function/UX Effect | None for end users — all fixes are internal consistency (version tags, doc counts, marker placement, port expectations, one enforce-path behavior). |
| Core Value | CI integrity: the aggregate gate must reflect verified current reality, not stale expectations or drifted docs. |
| Risk | Medium-low. F1-F3 are mechanical; F4-F5 require verify-which-side-is-wrong first so a real regression is not papered over. |

## 2. Background

- Branch `fix/patches_102026`; evidence verified 2026-10-10 from live runs (pre-digested brief — trusted, not re-derived).
- Gate: qa-aggregate, exercised by the `.github/workflows/contract-check.yml` pre-run. Result: 7158 PASS / 6 FAIL / 7166 TC across 8 files.
- The 6 failures cluster into 5 root causes (Section 3). F1-F4 are consistency drift from recent audit/refactor waves; F5 is behavioral and requires diagnosis before any edit.

## 3. Problem Statement — 6 Red Assertions, 5 Root Causes

| # | Assertion (suite) | Root cause |
|---|---|---|
| F1a | L3-006 "0 files missing @version" (`test/contract/v2112-deep-qa-invariants.contract.test.js`) | `lib/core/io.js` has no `@version` header tag — the br050 `_io` split created it without the tag |
| F1b | L1-016 "0 files missing @version" (`tests/qa/v2112-deep-qa-fixes.test.js`) | `lib/core/_io/shared.js` — same cause as F1a |
| F2 | Content regex `/STDOUT_REACHES_MODEL/` on `lib/core/io.js` (`test/regression/enh-433-hook-output-visibility.test.js`) | The br050 split moved the marker into `lib/core/_io/*` sub-modules; the test reads the wrapper (which re-exports from `_io/`) and the regex fails |
| F3 | CI-INV x2: lib module count (`test/contract/component-inventory.test.js`) | `AI-NATIVE-DEVELOPMENT.md` states 203 lib modules; the repository now has 207 (lib grew across audit waves without a doc update) |
| F4 | MCP port count strictEqual: actual 16 vs expected 13 (`test/contract/mcp-port.test.js`) | 3 new port↔adapter pairs added (v2.1.40 era, "8 Port↔Adapter pairs") without updating the test expectation — or the ports are unintended; must verify which |
| F5 | EN-06 "enforce checks content field": expected true !== actual false (`tests/qa/v2114-defense-memory-enforcer.test.js`) | Behavioral: suspect `lib/defense/memory-enforcer.js` enforce path no longer inspects the content field, or the fixture no longer matches enforcement behavior — diagnosis required |

## 4. Scope

**IN**
- The 5 findings above (F1-F5) and their sibling assertions inside the same suites.
- Minimal edits only: the missing tags, marker placement, doc count, port expectation, enforcer behavior — whichever side of each is verified wrong.

**OUT**
- Anything else agents stumble on during the fix: file it to `bug_reports/` per the out-of-scope rule (`~/.claude/rules/verification/verification-scope.md`); do not fix in this wave.
- Refactors of `lib/core/io.js` / `lib/core/_io/` beyond the marker/tag fix.
- Changes to the qa-aggregate script, gate thresholds, or the CI workflow.

## 5. Requirements

| ID | Requirement | Acceptance criterion (named suite green) |
|---|---|---|
| R1 | Add the missing `@version` header tags to `lib/core/io.js` and `lib/core/_io/shared.js`, copying the exact tag format from a conforming lib file | L3-006 green in `test/contract/v2112-deep-qa-invariants.contract.test.js` AND L1-016 green in `tests/qa/v2112-deep-qa-fixes.test.js` (0 files missing `@version`) |
| R2 | Restore `STDOUT_REACHES_MODEL` visibility for the enh-433 contract — either the marker belongs back in (or is referenced by) the wrapper, or the test must read the `_io` modules; decide from verified reality, not convenience | `test/regression/enh-433-hook-output-visibility.test.js` green |
| R3 | Reconcile the lib module count in `AI-NATIVE-DEVELOPMENT.md` with the verified repository count (currently 207) | Both CI-INV assertions green in `test/contract/component-inventory.test.js` |
| R4 | Reconcile the MCP port↔adapter count. FIRST verify which side is wrong: if the 3 new pairs are intended (v2.1.40 notes), update the expectation 13→16; if the ports are accidental, fix the code. Never blindly update the number | `test/contract/mcp-port.test.js` green, with the verify-first decision recorded in the fix report |
| R5 | Diagnose EN-06: determine whether `lib/defense/memory-enforcer.js` lost content-field inspection (code regression) or the fixture drifted from enforcement behavior (test drift); fix the side that is wrong | EN-06 green in `tests/qa/v2114-defense-memory-enforcer.test.js`; EN-06 must remain a true test — it must fail if content-field inspection is removed |

## 6. Success Criteria

- **SC-1:** `node test/contract/scripts/qa-aggregate.js` exits 0 with 0 FAIL (7166/7166 TC green).
- **SC-2:** The 24-step contract-check pre-run (`.github/workflows/contract-check.yml`) is all green on branch `fix/patches_102026`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Updating a test expectation papers over a real regression (highest on F4 port count, F5 enforcer) | Mandatory verify-first: for F4 and F5 the fixer proves which side is wrong (code or test) BEFORE editing, and records the decision. A wrong-side test update is a mask, not a fix |
| `@version` tag added in the wrong format trips the same invariant again | Copy the tag verbatim from an existing conforming lib file |
| Doc count (R3) re-drifts as lib grows | Use the verified count at fix time; CI-INV re-asserts every run so drift is caught immediately |
| Fixture change in R5 weakens the test into a bypass | EN-06 must stay a true test: assert the distinctive effect (content-field inspection), red when enforcement is broken |
| Scope creep into sibling defects spotted mid-fix | Out-of-scope finds are filed to `bug_reports/` in the same action, then skipped in this wave |

## 8. N/A — Product-Discovery Sections

Internal defect-fix wave (§45.9 bug-fix lane). All of the following are **N/A — internal defect-fix wave (§45.9 bug-fix lane)**:

- Personas — N/A
- Competitors — N/A
- Market sizing (TAM/SAM/SOM) — N/A
- Beachhead segment — N/A
- Go-to-market — N/A
- JTBD / Value Proposition — N/A

No external PM frameworks applied. Findings are pre-digested from live runs (2026-10-10) and trusted as-is per the brief.
