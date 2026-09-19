# QA Report — fix-preflight-hookdrop-mislead

**Date:** 2026-09-19
**Branch:** fix/misc_fixes_972026 (scope commit b0f0533)
**Verdict:** QA_PASS

## Scope Verified

- lib/infra/cc-version-checker.js — KNOWN_ISSUES `fork-default-agent-spawn` non-causality clauses
- lib/core/hook-reachability.js — exported `buildReachabilityWarning(missing, stale, reachFile)`
- hooks/session-start.js — call site delegates to the builder; guard/audit untouched
- test/unit/preflight-hookdrop-disambiguation.test.js (4 TC, registered run-all.js:171)
- CHANGELOG.md `[Unreleased]` entry
- Installed cache sync (3 files, plugin cache 2.1.38)

## L1 — Unit Tests (primary)

```
$ node --test test/unit/preflight-hookdrop-disambiguation.test.js \
    test/unit/cc-version-checker.test.js test/unit/preflight.test.js \
    test/unit/hook-reachability.test.js
--- Results: 4/4 passed, 0 failed ---
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

36/36 PASS across all four suites (disambiguation 4, cc-version-checker 8,
preflight, hook-reachability).

## L1 — Regression Sweep (adjacent suites)

Existence check first: `test/unit/hook-dispatch.test.js` does NOT exist —
noted and skipped. `test/unit/skill-name.test.js` exists.

```
$ node --test test/unit/skill-name.test.js
--- Results: 11/11 passed, 0 failed ---
```

11/11 PASS. Full-battery coverage (T-05, 1984 TC) was run green by the main
session post-implementation; this sweep re-verified the adjacent subset.

## Mutation Verification (true-test discipline, T-06 inverted)

Removed ONLY the summary non-causality suffix in
lib/infra/cc-version-checker.js (pre-mutation `git diff` captured to
/tmp/mut.patch — empty, confirming clean baseline):

```
- + '(subagent-spawn semantics ONLY — this is NOT a hook failure; hooks and /pdca skill fires are unaffected)',
+ + '(subagent semantics may change)',
```

Mutant run — RED, exactly the two tests guarding the clause:

```
FAIL T-01: fork-default-agent-spawn summary/detail carry non-causality clauses
  The input did not match the regular expression /NOT a hook failure/i.
FAIL T-02: renderCCVersionWarning known-issues branch renders the clause
  The input did not match the regular expression /NOT a hook failure/i.
--- Results: 2/4 passed, 2 failed ---
```

(T-03/T-04 — reachability-side TCs — correctly remained green: the mutation
is out of their scope.)

Restore + re-run — GREEN:

```
$ git checkout -- lib/infra/cc-version-checker.js
$ node --test test/unit/preflight-hookdrop-disambiguation.test.js
--- Results: 4/4 passed, 0 failed ---
```

The disambiguation tests FAIL when the fix is broken — they are true tests.

## Cache-Sync Verification

```
$ diff -q lib/infra/cc-version-checker.js ~/.claude/plugins/cache/bkit-marketplace/bkit/2.1.38/lib/infra/cc-version-checker.js
IDENTICAL
$ diff -q lib/core/hook-reachability.js .../lib/core/hook-reachability.js
IDENTICAL
$ diff -q hooks/session-start.js .../hooks/session-start.js
IDENTICAL
```

3/3 identical — working tree and installed plugin cache are in sync.

## Live Probe (T-06)

Note: `renderCCVersionWarning` is exported from
`hooks/startup/preflight.js` (not cc-version-checker) — probe imports
corrected accordingly.

```
renderCCVersionWarning(checkCCVersion()):
CC v2.1.278: fork mode is on by default and the Agent tool loses its
`run_in_background` parameter (subagent-spawn semantics ONLY — this is NOT
a hook failure; hooks and /pdca skill fires are unaffected). bkit
recommends v2.1.220; run `/bkit` or see docs/06-guide/cc-compatibility.guide.md ...

buildReachabilityWarning(['skill_post'], [], <reachFile>):
⚠️ bkit hook reachability check: missing=[skill_post] stale=[]. CC
plugin-hook drop (#57317) suspected — evidence: /project/.bkit/runtime/
hook-reachability.json (a real drop takes the bash_post/write_post canaries
down too; FRESH canary stamps mean hooks ARE firing — if a PDCA registry is
stalled while canaries are fresh, suspect skipped /pdca <phase> skill fires,
not a hook drop). ...
```

Assertions: rendered line contains "NOT a hook failure" — true;
contains "fork mode" — true; reachability line mentions "skill" — true;
carries the evidence path — true. Probe exit 0.

## CHANGELOG Verification

`## [Unreleased]` at line 8, above the first released heading
(`## [2.1.39]` line 21), and contains
`### Fixed — fix-preflight-hookdrop-mislead` with the session-start
preflight disambiguation entry.

## L2-L5

L2 (API), L3 (E2E), L4 (UX Flow), L5 (Data Flow): **N/A — no server/UI
(Node CLI plugin repo)**. This is a scope determination, not a fallback.

## Summary

| Check | Result |
|-------|--------|
| L1 primary (4 suites) | 36/36 PASS |
| L1 regression sweep | 11/11 PASS (hook-dispatch.test.js absent — skipped) |
| Mutation RED/GREEN | T-01/T-02 RED on mutant; 4/4 GREEN after restore |
| Cache sync | 3/3 identical |
| Live probe T-06 | all assertions hold |
| CHANGELOG | present and positioned correctly |

**QA_PASS** — L1 green, mutation-verification proven, cache identical,
probe assertions hold.
