# br287-br289-fixes Design Document

> **Summary**: Closure-workflow design for two already-committed fixes — verification evidence model, report lifecycle, CHANGELOG, and branch delivery.
>
> **Project**: bkit-claude-code
> **Version**: (maintainer-owned — not modified)
> **Author**: Claude Code loop
> **Date**: 2026-10-14
> **Status**: Draft
> **Planning Doc**: [br287-br289-fixes.plan.md](../01-plan/features/br287-br289-fixes.plan.en.md)

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | Two open bug reports whose fixes are committed but not closed out — reports, CHANGELOG, and delivery workflow remain. |
| **WHO** | bkit plugin maintainers and CI (contract-check runs eslint; operator's Stop flow runs unified-stop/skill-stop hooks). |
| **RISK** | Verification drift; pushing to the wrong remote/branch; accidental merge to main. |
| **SUCCESS** | Both reports in completed/ with .completed markers; CHANGELOG updated; all tests pass; branch pushed to origin; no PR, no merge to main. |
| **SCOPE** | Verify both fixes → close 2 reports → CHANGELOG → commit → run tests/workflows → push branch to origin. |

---

## 1. Overview

### 1.1 Design Goals

1. Zero new runtime code — both fixes are already in HEAD (commit 44060a9).
2. Fresh evidence for every closure claim (no citing the fix commit as proof).
3. Delivery exactly as the operator specified: local commits → tests → push branch; never PR, never merge.

### 1.2 Design Principles

- Measure the present system: every verification is a fresh run in this session.
- The bug-report catalog is the audit trail: status changes by location + `.completed` marker, never deletion.
- The PDCA registry is never hand-edited; phases advance only via skill fires.

---

## 2. Verified Fixes (evidence already gathered this session)

### 2.1 br287 — stale PDCA-COMPLETE loop

- **Fix in tree**: [scripts/pdca-skill-stop.js:452](../../../scripts/pdca-skill-stop.js#L452) — terminal-feature early exit (`archived`/`completed`/`archivedAt`/`archivedTo` check) so a finished cycle's Stop is approved silently instead of re-emitting PDCA-COMPLETE.
- **Fresh verification**: node probe against the live registry `.bkit/state/pdca-status.json` — all 16 archived entries evaluate as terminal under the fix predicate. PASS.

### 2.2 br289 — eslint jest globals missing

- **Fix in tree**: [eslint.config.js:153](../../../eslint.config.js#L153) — flat-config override block declaring jest globals + env for `test-scripts/**`, marked `br289` in a comment.
- **Fresh verification**: `npx eslint test-scripts/` → 0 errors (4 pre-existing warnings, unrelated). PASS.

---

## 3. Closure Workflow Design

| Step | Mechanism | Artifact |
|------|-----------|----------|
| 1. Fill Fix + Verification fields of each report | Edit in place (11-field template) | 2 updated reports |
| 2. Move reports to completed | `git mv` to `bug_reports/completed/BR/`, rename `*.md` → `*.completed.md` | 2 closed reports |
| 3. CHANGELOG | Add `## [Unreleased]` section with br287/br289 entries (version number stays maintainer-owned) | CHANGELOG.md |
| 4. Commit | Conventional commits, no co-author trailer, on `fix/patches_102026` | local commits |
| 5. Tests | Full jest battery + eslint; run `.github/workflows` equivalents locally | test logs |
| 6. Push | `git push origin fix/patches_102026` only | remote branch |

### 3.1 Explicit Prohibitions (operator directive)

- NO `gh pr create`, NO merge to `main`, NO merge to upstream `main`.
- No registry writes outside skill fires.
- No lint suppressions.

---

## 4. Architecture Selection

Three options considered:

| Option | Description | Verdict |
|--------|-------------|---------|
| A — Minimal | Verify + close + deliver exactly per plan | **Selected** |
| B — Clean | Additionally refactor stop-hook completion detection into a lib module | Rejected: new code in a no-new-code cycle; out of scope |
| C — Pragmatic | A + also clean the `ZfeatA` junk registry row | Rejected: registry writes need their own decision (noted in plan §2.2) |

---

## 5. Implementation Guide

| # | Item | Files |
|---|------|-------|
| 1 | Fill Fix/Verification on br287 report | bug_reports/active/br/br287-*.md |
| 2 | Fill Fix/Verification on br289 report | bug_reports/active/br/br289-*.md |
| 3 | `git mv` both → completed/BR/*.completed.md | bug_reports/ |
| 4 | CHANGELOG entries under `## [Unreleased]` | CHANGELOG.md |
| 5 | Report + archive PDCA docs via skill fires | docs/0{1,2,4}-* |
| 6 | Commit; run jest battery + eslint | — |
| 7 | `git push origin fix/patches_102026` | — |

### 5.1 Session Guide

Single session — the whole design is one module (closure workflow). No `--scope` split needed.

---

## 6. Test Plan

- jest full battery: 0 FAIL expected (baseline 5358 TC / 0 FAIL from br040-041 cycle).
- eslint over repo: 0 errors.
- Manual probes (already recorded in §2) constitute the fix-specific runtime verification.

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Battery has new failures since baseline | Triage before push; failure set → one complete-fix dispatch per testing-handoff protocol |
| Push rejected (non-fast-forward) | Surface to operator; never force-push |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-14 | Initial draft | Claude Code loop |
