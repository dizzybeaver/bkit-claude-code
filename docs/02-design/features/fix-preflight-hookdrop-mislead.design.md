# fix-preflight-hookdrop-mislead Design Document

> **Summary**: Precise wording changes to two session-start warning emitters plus content-assertion regression tests, so the preflight layer can no longer be read as "newer CC version ⇒ hook drops."
>
> **Project**: bkit-claude-code
> **Version**: 2.1.38 (maintainer assigns release version)
> **Author**: dizzybeaver (agent-executed)
> **Date**: 2026-09-19
> **Status**: Approved (Option C — Pragmatic Balance; L4 auto-selected per checkpoint 3, AskUserQuestion banned)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Two independent advisories fused by a reader into "2.1.278 > 2.1.220 ⇒ hook drops ⇒ registry stall," producing invalid br004 and a stranded PDCA cycle |
| **WHO** | Downstream Claude sessions diagnosing registry/archive failures from bkit preflight output |
| **RISK** | Existing tests asserting old strings; mitigated by pre-edit grep + deliberate assertion updates |
| **SUCCESS** | Both rendered warnings carry disambiguation clauses, locked by green tests; CI gates green; archived |
| **SCOPE** | 2 source files (string content only), 1 new test file, CHANGELOG; zero logic changes |

---

## 1. Overview

### 1.1 Purpose

Make each session-start warning close its own causal door:

- The CC-version known-issue advisory must state that the measured issue (Agent-tool fork semantics) is not a hook failure and that version-vs-recommended is not evidence of hook drops.
- The hook-reachability warning must point at its own evidence file, state the canary-corroboration rule, and name the likely non-hook cause of a stalled registry (skipped `/pdca <phase>` skill fires).

### 1.2 Background

Forensics in closed br004b: registry `lastUpdated` == the `/pdca qa` fire instant; canary stamps (`bash_post`, `write_post`) fresh throughout. The warning wording was the only bridge supporting the false chain.

### 1.3 Related Documents

- Plan: `docs/01-plan/features/fix-preflight-hookdrop-mislead.plan.md`
- Closed report: `bug_reports/completed/BR/br004b-stop-handler-phase-advancement-drops.invalid-workflow-deviation.completed.md`
- `lib/core/hook-reachability.js` (#126 rationale)

---

## 2. Scope

### 2.1 In Scope

- [ ] `lib/infra/cc-version-checker.js` — `fork-default-agent-spawn` entry: compact non-causality clause in `summary`, full clause in `detail`.
- [ ] `hooks/session-start.js` — reachability `warnMsg` rewrite (evidence path + canary rule + skill-fires pointer).
- [ ] `test/unit/preflight-hookdrop-disambiguation.test.js` — new content-assertion tests.
- [ ] `CHANGELOG.md` — `## [Unreleased]` entry.

### 2.2 Out of Scope

- Gate/state-machine/hook-dispatch logic; `RECOMMENDED_VERSION`; the entry's existence; python_infrastructure recovery.

---

## 3. Architecture (Option C — Pragmatic Balance)

### 3.1 Options Considered

| Option | Description | Verdict |
|---|---|---|
| A — Minimal | Append text in strings, no tests | Rejected: untestable, violates repo convention |
| B — Clean | Shared constants module imported by both emitters | Rejected: over-abstraction for two literals; cross-module coupling for prose |
| **C — Pragmatic (selected)** | In-place string edits in the two owners + content-locked tests | Single-source-per-message preserved; renderer keeps composing from checker data |

### 3.2 Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Clause home | `summary` (compact) + `detail` (full) in the KNOWN_ISSUES entry | The rendered line IS what downstream sessions read (`preflight.js:68-70` renders `summary` verbatim); detail serves `/bkit` deep paths |
| Summary length | Keep ≤ ~200 chars so the preflight line stays one readable sentence pair | Warning-trust budget: longer advisories get skimmed |
| Reachability text | Full rewrite of the single `warnMsg` template literal | Leaf string, one consumer |
| Tests | Content assertions on `renderCCVersionWarning` output + on the session-start module's message builder | Matches `test/unit/hook-reachability.test.js` idiom; mutation-detectable |

### 3.3 Data Flow (unchanged)

```
KNOWN_ISSUES[0].summary ──▶ checkCCVersion().knownIssues ──▶ renderCCVersionWarning (preflight.js:67-71)
KNOWN_ISSUES[0].detail  ──▶ /bkit detail paths, guide prose
hook-reachability.json  ──▶ evaluateReachability ──▶ session-start.js:447 warnMsg
```

No producer/consumer changes — strings only.

---

## 4. Detailed Design

### 4.1 `lib/infra/cc-version-checker.js` — KNOWN_ISSUES entry

```js
summary:
  'fork mode is on by default and the Agent tool loses its `run_in_background` parameter '
  + '(subagent-spawn semantics ONLY — this is NOT a hook failure; hooks and /pdca skill fires are unaffected)',
detail: (existing text) +
  ' NOTE: this measured issue concerns subagent spawn semantics alone. It is NOT a plugin-hook drop '
  + '(#57317) and NOT evidence that bkit hooks stopped firing. A CC version newer than '
  + 'RECOMMENDED_VERSION is a tested-floor statement, not a defect signal — for hook health read '
  + '.bkit/runtime/hook-reachability.json (fresh bash_post/write_post canary stamps = hooks firing).',
```

### 4.2 `hooks/session-start.js` — reachability warnMsg

```js
const warnMsg = '\n⚠️  bkit hook reachability check: missing=[' + missing.join(',') + '] stale=['
  + stale.join(',') + ']. CC plugin-hook drop (#57317) suspected — evidence: '
  + reachFile + ' (a real drop takes the bash_post/write_post canaries down too; FRESH canary '
  + 'stamps mean hooks ARE firing — if a PDCA registry is stalled while canaries are fresh, '
  + 'suspect skipped /pdca <phase> skill fires, not a hook drop). '
  + 'See docs/sprint/v2114 MON-CC-NEW-PLUGIN-HOOK-DROP.';
```

### 4.3 New test file — `test/unit/preflight-hookdrop-disambiguation.test.js`

Tests (node:test + assert, matching repo idiom):

1. **known-issue summary carries the non-causality clause** — every KNOWN_ISSUES `summary` matches `/NOT a hook failure/i` (scales to future entries); specifically `fork-default-agent-spawn`.
2. **known-issue detail carries the full clause + evidence file** — matches `/NOT a plugin-hook drop/` and `/hook-reachability\.json/`.
3. **renderCCVersionWarning known-issues branch includes the clause** — build a report fixture with `knownIssues` from the real entry, assert output contains "NOT a hook failure" and "recommends".
4. **behind-recommended branch unchanged** — a `current < recommended` report still renders the upgrade advice (guards against wording regressions in the other branch).
5. **reachability warn message carries evidence + pointer** — export the message builder from session-start (or replicate the template) and assert `/skill fires/` and `/hook-reachability\.json/`. Prefer: extract `buildReachabilityWarning(missing, stale, reachFile)` as a named export from `hooks/session-start.js` and have the hook call it — testable without spawning CC.

### 4.4 Extract-for-testability (small, justified)

`hooks/session-start.js` currently builds `warnMsg` inline inside a try block. Extract:

```js
function buildReachabilityWarning(missing, stale, reachFile) { ... return warnMsg; }
module.exports = { buildReachabilityWarning };  // appended to existing exports if any
```

The inline call site becomes `const warnMsg = buildReachabilityWarning(missing, stale, reachFile);`. Behavior identical; the test imports the builder directly. (session-start.js is hook-main-guarded, so require from tests is safe.)

---

## 5. Test Plan

| ID | Level | What | Expected |
|---|---|---|---|
| T-01 | L1 unit | KNOWN_ISSUES summary/detail clauses | Regex match both |
| T-02 | L1 unit | renderCCVersionWarning output includes clause | contains "NOT a hook failure" |
| T-03 | L1 unit | behind-recommended branch intact | renders upgrade advice |
| T-04 | L1 unit | buildReachabilityWarning output | contains evidence path + "skill fires" pointer |
| T-05 | L1 regression | existing cc-version-checker tests still green | run-all unit battery |
| T-06 | Live probe | `node -e checkCCVersion()` + render through preflight | clause visible in rendered line |

T-06 is the mutation check inverted: reverting either string makes T-01/T-04 red (verified during Do).

---

## 6. Implementation Guide

1. Grep old strings; enumerate test assertions to update (found: `test/unit/cc-version-checker.test.js` asserts fields exist, not content — no breakage expected; verify preflight.test.js).
2. Edit the two emitters per §4.1/§4.2; extract builder per §4.4.
3. Write `test/unit/preflight-hookdrop-disambiguation.test.js` per §5 (T-01..T-04).
4. Register in `test/run-all.js` (check-test-tracking CI gate requires it).
5. Run: `node test/run-all.js --unit` (full unit battery), `npx eslint` changed files, CI gate scripts (check-domain-purity, check-guards, docs-code-sync).
6. CHANGELOG `## [Unreleased]` entry (scanVersions skips provisional headings — br004/1st precedent).
7. Sync changed files to installed cache `~/.claude/plugins/cache/bkit-marketplace/bkit/2.1.38/` (backup first).
8. Verify T-06 live probe; then Check → QA → Report → Archive.

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| session-start.js extraction changes hook behavior | Pure string-builder extraction; try-block shape untouched; unit battery + live probe |
| Existing tests assert `summary` content | Pre-edit grep; only field-existence assertions found so far |
| CI docs-code-sync drift | `[Unreleased]` heading skipped by scanVersions (measured, br004/1st) |

---

## 8. Success Criteria (from Plan §4)

All Plan DoD items apply; T-01..T-06 evidence recorded in Analysis doc.

---

## 9. Session Guide

Single-session scope (module-1 = everything): ~15 lines across 2 source files, 1 test file (~80 lines), 1 CHANGELOG block.

| Module | Files | Est. |
|---|---|---|
| module-1 | cc-version-checker.js, session-start.js, new test, run-all.js, CHANGELOG | ~120 ln |

---

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-09-19 | Initial design (Option C, L4 auto-approved) | dizzybeaver (agent) |
