# br045-scope-advisory-fixes Design Document

> **Summary**: Exact edits — fixture sandbox (env-swap + require-cache purge), try/finally defense, allowlist tier additions, live-level restore via setLevel.
>
> **Project**: bkit-claude-code (bkit Vibecoding Kit v2.1.40) · **Date**: 2026-10-10 · **Status**: Draft
> **Planning Doc**: [plan](../../01-plan/features/br045-scope-advisory-fixes.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | br045: spurious L0 scope advisories; control-state level desyncs from session. |
| **WHO** | Maintainer, dispatched subagents, pre-write hook consumers. |
| **RISK** | Require-cache miss → sandbox silently no-op (PROJECT_DIR is load-time const). |
| **SUCCESS** | SC-1 battery leaves currentLevel unchanged; SC-2 probes allowed at L2; SC-3 24-step battery green. |
| **SCOPE** | 2 files edited + 1 API restore. No ENH-398 change. |

---

## 2. Architecture — Option A (minimal point edits)

Verified facts anchoring the edits:
- `PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd()` is a **module-load-time const** (`lib/core/platform.js:47`) — sandbox MUST purge the require cache for `platform` + `automation-controller` (idiom: `tests/qa/bkit-deep-system.test.js` A2-1/A2-5 `purge(/…/)`).
- `getEffectiveScope`: `level <= 1` → strict; `2` → moderate; `3-4` → wide, and **wide aliases `DEFAULT_SCOPE.allowedPaths`** (`scope-limiter.js:69` → line 19) — the wide-tier addition lands in DEFAULT_SCOPE.
- `_globMatch`: `*` → `[^/]*` — so `*.md` matches **root-level md only**; `docs/**` continues to cover nested docs. Verified this session.
- The live restore goes through `setLevel` (public writer of runtime control state — not the PDCA registry; G-020 not implicated).

## 8. Test Plan

| Level | Check | Runner |
|-------|-------|--------|
| SC-2 probe | `checkPathScope('tests/foo.test.js', 2).allowed === true`; `checkPathScope('README.md', 2).allowed === true`; `checkPathScope('tests/foo.js', 0).allowed === false` (strict unchanged) | MAIN |
| SC-1 | record `currentLevel` → full battery → compare | MAIN |
| SC-3 | 24-step contract-check battery | MAIN |

## 11. Implementation Guide (exact edits)

| # | File | Edit |
|---|------|------|
| 1 | `tests/qa/v2112-deep-qa-fixes.test.js` | Wrap the L1 automation-controller test group in a sandbox: create temp dir; save `CLAUDE_PROJECT_DIR`; set it to the temp dir; `purge(/lib\/(core\/(platform\|cache\|config)\|control\/automation-controller)/)`; re-`require` the controller INSIDE the sandbox; run the existing L1-001..L1-004 bodies against it (each set/restore additionally wrapped in try/finally); after the group: restore env, purge same regex again. Add one assertion that the temp `control-state.json` was created (proves redirection) and that the REAL state file's mtime/content is untouched (read real file before/after group). |
| 2 | `lib/control/scope-limiter.js` | (a) `LEVEL_SCOPE_OVERRIDES.moderate.allowedPaths`: append `'tests/**', '*.md'`; (b) `DEFAULT_SCOPE.allowedPaths` (line 19): append `'tests/**', '*.md'`. Comment citing br045. Do NOT touch the `strict` tier. |
| 3 | (MAIN, post-Do) | `node -e "require('./lib/control/automation-controller').setLevel(4, { reason: 'br045 restore to work.md operating level', setBy: 'operator-work-md' })"` then verify readback. |

### 11.2 Order: edit 1 → 2 → MAIN runs edit 3 → SC-1..SC-3.

### 11.3 Session Guide: module-1 = edits 1+2, one agent dispatch.

## Version History

| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
|---|---|---|---|
