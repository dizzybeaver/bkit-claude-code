# br045-scope-advisory-fixes Planning Document

> **Summary**: Eliminate the spurious "not in allowed scope for L0" scope-limiter advisories by sandboxing the state-poisoning fixtures, closing the allowlist tier gaps, and restoring the live level (br045).
>
> **Project**: bkit-claude-code (bkit Vibecoding Kit v2.1.40)
> **Version**: 2.1.40
> **Author**: dizzybeaver (main session)
> **Date**: 2026-10-10
> **Status**: Draft
> **Lane**: §45.9 bug-fix cycle (pm → plan → design → do → report → archive)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Every legitimate subagent Edit emits a false "not in allowed scope for L0" advisory: the persisted control-state level is poisoned to 0 by an unsandboxed test fixture, and the allowlist tiers miss `tests/**` and root `*.md` anyway. |
| **Solution** | Hermetic env-swap sandbox + try/finally for the automation-controller fixtures; add `tests/**` and `*.md` to the moderate and wide (DEFAULT_SCOPE) tiers; restore the live level to 4 via the public `setLevel` API. |
| **Function/UX Effect** | Scope advisories appear only for genuinely out-of-scope paths; the persisted level stays coherent with the session across battery runs. |
| **Core Value** | A security-adjacent gate stops crying wolf; runtime control state becomes battery-proof. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | br045: spurious L0 scope advisories on every legitimate Edit; control-state level desyncs from the session. |
| **WHO** | Maintainer (dizzybeaver), dispatched subagents, pre-write hook consumers. |
| **RISK** | Sandbox must bust the require cache for platform.js AND automation-controller (PROJECT_DIR is a load-time const) or the temp dir is silently ignored. |
| **SUCCESS** | SC-1 battery leaves currentLevel unchanged; SC-2 checkPathScope probes allowed at L2; SC-3 24-step battery green. |
| **SCOPE** | 2 files edited (1 test fixture suite, 1 lib module), 1 runtime-state restore via API. No ENH-398 semantics change. |

---

## 1. Overview

### 1.1 Purpose

Fix br045's two root layers so the scope limiter's advisory output reflects real policy decisions instead of a poisoned level and incomplete allowlists.

### 1.2 Background

See [br045](../../../bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md): fixture writes real control-state without sandbox/try-finally (poisoned baseline self-perpetuates through the "restore"); tier gaps emit advisories even at correct levels. Live state confirmed `currentLevel: 0` with `previousLevel: 4` (the work.md operating level).

### 1.3 Related Documents

- Requirements: [PRD](../../00-pm/br045-scope-advisory-fixes.prd.en.md)
- Bug report: br045 (active)

---

## 2. Scope

### 2.1 In Scope

- [ ] R1: hermetic sandbox for automation-controller fixtures in `tests/qa/v2112-deep-qa-fixes.test.js`
- [ ] R2: try/finally around every set/restore pair in those fixtures
- [ ] R3: allowlist additions — `tests/**` and `*.md` to `moderate` tier and to `DEFAULT_SCOPE.allowedPaths` (the wide tier's alias)
- [ ] R4: live level restored to 4 via `setLevel(4, { setBy: 'operator-work-md' })`

### 2.2 Out of Scope

- ENH-398 advisory-vs-block semantics (stays as designed)
- Any pre-write.js behavior change
- DEFAULT_SCOPE's missing `tools/** work/** bug_reports/** .bkit/**` (br109 sibling note — operator decides)
- ZfeatA / test-feature registry junk (separate concern)

---

## 3. Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Fixtures sandbox: swap `CLAUDE_PROJECT_DIR` → temp dir, `purge(/lib\/(core\/(platform\|cache\|config)\|control\/automation-controller)/)`, re-require controller inside sandbox, restore env + purge after (idiom: bkit-deep-system A2-1/A2-5) | High | Pending |
| FR-02 | try/finally defense around each setLevel/restore block even inside the sandbox | Medium | Pending |
| FR-03 | `moderate.allowedPaths` += `'tests/**', '*.md'`; `DEFAULT_SCOPE.allowedPaths` += `'tests/**', '*.md'` (wide aliases DEFAULT at scope-limiter.js:69→19) | High | Pending |
| FR-04 | One-time MAIN action: `ctrl.setLevel(4, { reason: 'br045 restore to work.md operating level', setBy: 'operator-work-md' })` | High | Pending |

### 3.2 Non-Functional

| Category | Criteria | Measurement |
|----------|----------|--------------|
| True tests | Sandbox actually redirects (assert the temp state file exists after setLevel, real file untouched) | SC-1 |
| No behavior drift | strict tier unchanged; DENIED_PATH semantics unchanged | probe + suite green |

---

## 4. Success Criteria

- [ ] SC-1: full battery run leaves `.bkit/runtime/control-state.json` currentLevel equal to its pre-battery value
- [ ] SC-2: `checkPathScope('tests/foo.test.js', 2).allowed === true` AND `checkPathScope('README.md', 2).allowed === true`
- [ ] SC-3: 24-step contract-check battery all green (MAIN-executed)
- [ ] Report + archive phases complete

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Require-cache miss → sandbox silently no-op | High | Medium | FR-01 asserts the temp state file was written; purge regex covers platform+controller |
| Allowlist glob `*.md` semantics (root-level only vs recursive) | Medium | Medium | `_globMatch` treats leading-`*` extension patterns as basename matches — fixer must verify behavior for `docs/x.md` interplay and pick `*.md` (root) explicitly |
| Sibling suites also calling real setLevel | Medium | Medium | Grep `tests/` + `test/` for other `setLevel(` callers; sandbox any found that touch real state (in-scope per root-cause rule) |

---

## 6. Impact Analysis

| Resource | Change | Consumers | Impact |
|----------|--------|-----------|--------|
| scope-limiter.js tiers | additive allowlist entries | pre-write stage 8 advisory only | Fewer false positives; strict tier untouched |
| v2112-deep-qa-fixes.test.js | sandboxed fixtures | qa-aggregate | Coverage preserved (L1-001..004 still exercise setLevel semantics) |
| control-state.json | one-time setLevel(4) | hooks, trust-engine | Restores intended operating level |

---

## 7. Architecture — Option A (minimal point edits; defect lane size)

## 8. Conventions — sandbox idiom per bkit-deep-system A2; no co-author trailers; bilingual docs

## 9. Next Steps

1. [x] PRD — done
2. [ ] Design doc
3. [ ] Do: one scoped fix agent
4. [ ] MAIN: SC-1..SC-3
5. [ ] Report + archive

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
