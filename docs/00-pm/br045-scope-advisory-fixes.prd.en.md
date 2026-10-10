# PRD — br045-scope-advisory-fixes

**File:** docs/00-pm/br045-scope-advisory-fixes.prd.en.md (English SoT; Korean sibling: `br045-scope-advisory-fixes.prd.ko.md`)
**Version:** 0.1.0 (draft for Plan phase)
**Date:** 2026-10-10
**Purpose:** Defect-fix PRD for br045 — spurious "not in allowed scope for L0" advisories caused by a poisoned control-state baseline plus scope-limiter allowlist tier gaps.
**Lane:** PDCA bug-fix wave (§45.9) — minimal PRD, market sections N/A.
**Source defect:** `bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md`

## Executive Summary

| Perspective | Summary |
|------------|---------|
| Problem | Every legitimate subagent Edit emits a false "Scope limit: ... not in allowed scope for L0" advisory: battery fixtures poisoned the persisted control level to 0, and the L2 (moderate) / L3-4 (wide) allowlists are missing the repo's real QA dir (`tests/`) and root-level `*.md` docs. |
| Value | The scope gate's signal becomes trustworthy again — false-positive noise on a security-adjacent PreToolUse hook disappears, and the persisted automation level re-syncs with the session's real operating level (4). |
| Risk | Low. The gate is advisory-only (ENH-398: NOT_IN_SCOPE warns, never blocks), so no writes are currently lost. The fix touches one test fixture file, one allowlist table, and one sanctioned setLevel restore call. |

Standard PM sections (personas, competitors, TAM/SAM/SOM, JTBD / Value Proposition, beachhead, ICP/GTM): **N/A — internal defect-fix wave.**

## Background (br045 evidence)

- Dispatched fix agents received the L0 scope advisory on EVERY Edit across 3 Do-phase rounds of qa-aggregate-red-fixes, while the dashboard showed "L2 Semi-Auto" and `work/work.md` declares operating level 4.
- Live state: `.bkit/runtime/control-state.json` = `{currentLevel: 0, level: "manual", setBy: "runtime"}`, `previousLevel: 4`, `levelChangeReason: "L2-001 restore"`; file mtime equals the last battery run's completion time.
- `pre-write.js` stage 8 (`scripts/pre-write.js:366`) then applies the L0/L1 strict allowlist (`docs/**` + `.bkit/**` only) to every edit, producing the advisory.
- Edits still landed because ENH-398 keeps NOT_IN_SCOPE advisory-only — the defect is false-positive noise plus persisted-level desync, not blocked writes.

## Problem Statement — two independent root layers

### Layer A — poisoned control-state from unsandboxed fixtures

`tests/qa/v2112-deep-qa-fixes.test.js` fixtures (L1-001..L1-004+) call the REAL `ctrl.setLevel(0, ...)` against the REAL `.bkit/runtime/control-state.json` — no hermetic sandbox — then restore with a bare `ctrl.setLevel(before.currentLevel, ...)` line:

- Any assertion failing between set and restore throws past the restore line (no try/finally), leaving the live file at level 0.
- The "restore" reads its baseline from the already-poisoned file, so every subsequent battery run faithfully restores to 0 forever (self-perpetuating poison).

### Layer B — allowlist tier gaps (fires even at the correct level)

`lib/control/scope-limiter.js` `LEVEL_SCOPE_OVERRIDES` (line 51):

- `moderate` (L2, line 62) lists `test/**` (singular — no such dir exists) but not `tests/**` (the repo's actual QA dir) and no root `*.md` (`AI-NATIVE-DEVELOPMENT.md`, `CUSTOMIZATION-GUIDE.md`, `README.md`, ...). br109 added `tools/ work/ bug_reports/` but missed these.
- `wide` (L3-4, line 69) aliases `DEFAULT_SCOPE.allowedPaths` (line 19), which lacks both `tests/**` and `*.md`.

Ordinary in-repo edits to these paths emit the same advisory at any level >= 2.

## Scope

**IN**

1. Fixture hermetic sandbox in `tests/qa/v2112-deep-qa-fixes.test.js` (R1) + try/finally defense (R2).
2. Allowlist additions `tests/**` + root `*.md` to the moderate and wide tiers in `lib/control/scope-limiter.js` (R3).
3. One-time restore of the live level to 4 via the public `ctrl.setLevel` API (R4).

**OUT**

- Any change to ENH-398 advisory-vs-block semantics.
- Any `pre-write.js` behavior change (its stage-8 lookup is correct once the level is correct).
- ZfeatA registry junk — separate concern / carry item (same unsandboxed-fixture class).

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | **Hermetic fixture sandbox.** The automation-controller fixtures in `v2112-deep-qa-fixes.test.js` run against a temp-dir state file, not the repo's `.bkit/runtime/control-state.json`. Mechanism: swap `CLAUDE_PROJECT_DIR` to a temp dir, purge the require cache for the affected modules — `deleteMatchingCache(/lib\/(core\/(platform|cache|config)|control\/automation-controller)/)` — then re-require. Pattern established by `tests/qa/bkit-deep-system.test.js` A2-1/A2-5. |
| R2 | **try/finally defense.** Every set-level/restore pair in those fixtures is wrapped in try/finally so a throwing assertion can no longer skip the restore. Defense in depth behind R1. |
| R3 | **Allowlist additions.** Add `'tests/**'` and `'*.md'` (root-level docs; the limiter's glob treats `*` as non-recursive, so `*.md` stays root-anchored) to `LEVEL_SCOPE_OVERRIDES.moderate.allowedPaths` and to the wide tier. Note: wide delegates to `DEFAULT_SCOPE.allowedPaths` (`scope-limiter.js:69`), so the wide-tier edit lands in `DEFAULT_SCOPE` (line 19). |
| R4 | **Live level restore.** Restore the persisted level through the sanctioned public API — `ctrl.setLevel(4, { setBy: 'operator-work-md', ... })` — matching `work/work.md`'s declared operating level 4. `.bkit/runtime/control-state.json` is runtime state, NOT the PDCA registry; `setLevel` is its public writer. No hand edits to `.bkit/runtime/`. |

## Success Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC-1 | A full battery run leaves `.bkit/runtime/control-state.json` `currentLevel` unchanged from the pre-battery value. | Record the value before the battery; compare after; expect equal (and equal to 4 once R4 lands). |
| SC-2 | Tier-gap probe at L2: `checkPathScope('tests/foo.test.js', 2)` and `checkPathScope('README.md', 2)` both return `allowed: true`. | Direct `node -e` probe against `lib/control/scope-limiter.js`. |
| SC-3 | 24-step contract-check battery all green. | Battery run output. |

## Risks

| Risk | Detail | Mitigation |
|------|--------|------------|
| Incomplete require-cache bust | `PROJECT_DIR` is a module-load-time const; if the purge misses `lib/core/platform.js` (or `lib/control/automation-controller.js`), the re-required controller ignores the temp dir and the fixture silently writes real state again. | Purge regex must cover platform, cache, config, AND automation-controller (per A2-1/A2-5); SC-1 readback catches any residue. |
| Restore ordering | `setLevel` also writes transition metadata (`lastAutoTransition: "trust-downgrade"` observed live); the R4 restore must be the final state mutation of the fix batch. | Run restore last; SC-1 compares only `currentLevel`, as specified. |
| Sibling gap (note only, out of scope) | The wide tier (`DEFAULT_SCOPE`) also lacks `tools/**`, `work/**`, `bug_reports/**`, `.bkit/**` that moderate gained via br109 — flagged here, not fixed here. | Operator decides whether to file a follow-up report. |

## Non-Goals

- No semantic change to the scope limiter's advisory-vs-block behavior (ENH-398 stays).
- No changes to `scripts/pre-write.js`.
- No cleanup of ZfeatA registry junk (tracked separately).
- No market/user research deliverables — see the N/A note under Executive Summary.
