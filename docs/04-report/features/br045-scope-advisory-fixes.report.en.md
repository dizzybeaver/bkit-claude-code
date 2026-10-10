# br045-scope-advisory-fixes Completion Report

> **Status**: Complete
>
> **Project**: bkit-claude-code
> **Author**: report-generator
> **Completion Date**: 2026-10-10
> **PDCA Cycle**: defect-fix wave §45.9 (br045)
> **Note**: English is the source of truth; the Korean sibling (`br045-scope-advisory-fixes.report.ko.md`) mirrors this content.

---

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|------|---------|
| Feature | br045-scope-advisory-fixes (bug-fix lane §45.9) |
| Start Date | 2026-10-10 |
| End Date | 2026-10-10 |
| Duration | single session (pm → plan → design → do 8 rounds → report) |
| Agents | pm-lead (~97K), implement-feature "br045-impl" (8 warm-context rounds, ~1.3M total); MAIN executed all tests + instrumentation |

### 1.2 Results Summary

```
┌─────────────────────────────────────────────┐
│  Completion Rate: 100% (SC 3/3)             │
├─────────────────────────────────────────────┤
│  ✅ Complete:     3 / 3 Success Criteria    │
│  ⏳ Deferred:      1 carry item (operator)  │
│  ❌ Cancelled:     0                        │
└─────────────────────────────────────────────┘
```

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | Spurious "not in allowed scope for L0" advisories fired on every legitimate Edit, and the control-state level desynced from the session. |
| **Solution** | Root-caused 3 layers: unsandboxed test fixtures writing the real `.bkit/runtime/control-state.json`, allowlist tier gaps, and level-dependent regression suites unmasked by the fix; then sandboxed all 10 writer suites and closed the allowlist gaps. |
| **Function/UX Effect** | Legitimate Edits (tests/**, root *.md) no longer warn; SC-1 level coherence pre=4/post=4 across the full battery; qa-aggregate 7179 PASS / 0 FAIL / exit 0. |
| **Core Value** | Restores trust in the scope-advisory signal — advisories now mean something — while the strict tier remains fully intact. |

### 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---------|:------:|----------|
| SC-1 | Control-state level coherence across full battery | ✅ Met | pre=4, post=4 across full 405-file run (after 6 failed attempts across rounds); live level restored to 4 via public setLevel |
| SC-2 | Allowlist tiers correct, strict untouched | ✅ Met | probes: tests/foo.test.js @L2 allowed; README.md @L2 allowed; tests/foo.js @L0 denied; .env @L4 denied |
| SC-3 | Full suite green | ✅ Met | all 24 contract-check steps green; qa-aggregate 7179 PASS / 0 FAIL / 0 errored / exit 0 |

**Success Rate**: 3/3 criteria met (100%)

### 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|--------|----------|:---------:|---------|
| [PRD] | Defect-fix wave §45.9 scope | ✅ | Followed as written |
| [Plan] | Option A minimal edits | ✅ (with honest growth) | 8 rounds vs 1 planned; each round closed a verified writer class, not rework (masked-sibling economics) |
| [Design] | Sandbox idioms + verified glob semantics | ✅ | Followed; the barrel-memoization discovery was an unplanned but necessary extension |

---

## 2. Related Documents

| Phase | Document | Status |
|-------|----------|--------|
| PM | br045-scope-advisory-fixes.prd.en.md / .ko.md (docs/00-pm/) | ✅ Finalized |
| Plan | br045-scope-advisory-fixes.plan.en.md / .ko.md (docs/01-plan/features/) | ✅ Finalized |
| Design | br045-scope-advisory-fixes.design.en.md / .ko.md (docs/02-design/features/) | ✅ Finalized |
| Report | Current document (+ .ko.md sibling) | ✅ Complete |

---

## 3. Completed Items

### 3.1 Root-Cause Fixes (3 layers, all verified live)

| # | Root Cause | Fix | Status |
|---|-----------|-----|:------:|
| RC-1 | Unsandboxed test fixtures writing real `.bkit/runtime/control-state.json` | 10 test files sandboxed (2 sandbox idioms, see §3.3) | ✅ |
| RC-2 | Allowlist tier gaps: `tests/**` and root `*.md` missing from moderate + DEFAULT_SCOPE | `lib/control/scope-limiter.js` allowlists extended (strict tier untouched); `*.md` verified root-only via `_globMatch` `*`→`[^/]*` | ✅ |
| RC-3 | Level-dependent regression suites asserted pushes ALLOWED — true only under the poisoned low level | test/regression/bash-pre-decision.test.js + test/regression/enh-459-463-hook-path-guards.test.js updated to expect the ENH-298 push guard at correct L4 | ✅ |

### 3.2 Final Writer Inventory (8 suites, attribution-verified)

- tests/qa/v2112-deep-qa-fixes.test.js — setLevel, no try/finally; poisoned-baseline self-perpetuation
- tests/qa/bkit-deep-system.test.js — A5-3/A5-4
- test/unit/automation-controller.test.js — AC-007..010, AC-021..024 (incl. manual→0)
- test/philosophy/automation-first-v2.test.js — AF-008
- test/philosophy/security-by-default-v2.test.js — SB-004
- test/unit/trust-engine-reconcile.test.js — reconcile→syncToControlState
- test/e2e/permission-mode-matrix.test.js — 147 spawned hook children with real-env CLAUDE_PROJECT_DIR
- test/controllable-ai/always-interruptible.test.js — AI-002/003/017 emergencyStop/Resume pairs + AI-004/005/018 setLevel (round-1 grep matched only `setLevel(` and missed emergencyStop/Resume)

### 3.3 Key Technical Discovery — require-cache barrel defeats sandboxing

`lib/core/index.js` is a BARREL that memoizes `require('../core')`; automation-controller holds a platform instance resolved at first load. A sandbox purging only platform/cache/config module keys leaves the barrel pinning the REAL PROJECT_DIR, silently defeating the redirect.

**Fix**: barrel-inclusive purge regex `/lib\/(core\/|control\/(automation-controller|trust-engine))/`. Probe-verified by the fix agent.

### 3.4 Sandbox Patterns Established (2)

1. **In-process**: env swap + require-cache purge (barrel-inclusive) + re-require + absence-tolerant byte-identical proof.
2. **Seeded-sandbox**: for spawned children — child env CLAUDE_PROJECT_DIR → mkdtemp seeded with control-state at level 2 (= DEFAULT_LEVEL), preserving decision semantics.

### 3.5 Deliverables

| Deliverable | Location | Status |
|-------------|----------|--------|
| Allowlist fix + br045 comments | lib/control/scope-limiter.js | ✅ |
| Sandboxed suites (10 files) | test/…, tests/… (see git status) | ✅ |
| Live level restoration | via public setLevel → 4 (setBy operator-work-md per work.md) | ✅ |
| PM/Plan/Design docs (bilingual) | docs/00-pm, 01-plan, 02-design | ✅ |

---

## 4. Incomplete Items

### 4.1 Carried Over (operator decides)

| Item | Reason | Priority |
|------|--------|----------|
| DEFAULT_SCOPE lacks tools/**, work/**, bug_reports/**, .bkit/** that moderate has | br109 sibling; noted one-line in PRD risks | Low |
| ZfeatA registry junk cleanup | Pending, unrelated to br045 | Low |

### 4.2 Cancelled/On Hold

| Item | Reason | Alternative |
|------|--------|-------------|
| - | - | - |

---

## 5. Quality Metrics

### 5.1 Verification (MAIN-executed)

| Check | Result |
|-------|--------|
| SC-1 level coherence | pre=4 post=4 across full battery — PASS (after 6 failed attempts across rounds) |
| SC-2 allowlist probes | 4/4 as designed (allow/allow/deny/deny) |
| SC-3 contract-check | all 24 steps green |
| SC-3 qa-aggregate | 7179 PASS / 0 FAIL / 0 errored / exit 0 |
| Attribution | full 405-file sequential run + mtime watcher → writer set fully enumerated; final run: zero writes |

### 5.2 Resolved Issues

| Issue | Resolution | Result |
|-------|------------|--------|
| Spurious L0 scope advisories on every Edit | RC-1 sandboxing + RC-2 allowlist | ✅ |
| Control-state level desync | writer enumeration + sandbox isolation + live restore to 4 | ✅ |
| Hidden writers surviving grep | mtime-watcher attribution + barrel-inclusive purge | ✅ |

---

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

- Attribution watchers beat grep: the per-file mtime watcher named writers grep could not.
- Round 4's verify-only gate discipline (0-edit verdict) prevented shotgunning 6 innocent suites.
- Warm-context reuse (8 rounds on one implement agent, ~1.3M total) avoided per-round re-discovery.

### 6.2 What Needs Improvement (Problem)

- MAIN grep probes must NOT be head-truncated: the round-1 sibling check `| head -8` hid 3 writer files and cost 2 extra rounds.
- Ambient-state-dependent tests hide until the ambient state is fixed — expect unmasking cascades when correcting shared state (RC-3 was invisible until RC-1/RC-2 landed).
- Grep patterns miss differently-named writers (`setLevel(` vs emergencyStop/Resume) — pattern families, not single patterns.

### 6.3 What to Try Next (Try)

- Require-cache barrels defeat env-swap sandboxes silently — every sandbox purge must cover the barrel (`lib/core/index.js`), not just leaf modules.
- Prefer mtime/file-watch attribution over grep enumeration when hunting ambient-state writers.
- Masked-sibling economics: budget for multi-round fixes when crashing files hide later assertions; each round should close a verified writer class.

---

## 7. Process Improvement Suggestions

| Phase | Observation | Suggestion |
|-------|-------------|-----------|
| Do | 8 rounds vs 1 planned | Pre-budget unmasking cascades in ambient-state defect fixes |
| Check | Grep sibling scan truncated | Ban `head` truncation on writer-inventory greps |
| Tools | Manual mtime watcher | Promote attribution watcher to a reusable tools/ driver |

---

## 8. Next Steps

### 8.1 Immediate

- [ ] Operator decision: close br109 sibling gap (DEFAULT_SCOPE missing tools/**, work/**, bug_reports/**, .bkit/**)
- [ ] Operator decision: ZfeatA registry junk cleanup

### 8.2 Next PDCA Cycle

| Item | Priority | Expected Start |
|------|----------|----------------|
| br109 DEFAULT_SCOPE tier alignment | Low | operator-triggered |
| ZfeatA registry cleanup | Low | operator-triggered |

---

## 9. Changelog

### Unreleased (2026-10-10)

**Fixed:**
- br045: spurious "not in allowed scope for L0" advisories on legitimate Edits (allowlist tiers in lib/control/scope-limiter.js; strict tier untouched)
- br045: control-state level desync caused by 8 unsandboxed test suites writing real .bkit/runtime/control-state.json (10 suites sandboxed)
- Unmasked RC-3: level-dependent regression assertions corrected for true L4 behavior (ENH-298 push guard)

**Changed:**
- Test sandboxing idioms established: barrel-inclusive require-cache purge + seeded mkdtemp sandbox for spawned children

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-10 | Completion report created | report-generator |
