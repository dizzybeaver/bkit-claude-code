# hook-audit-fix-wave-1028 Design Document

> **Summary**: Fix-wave design for 38 hook-layer defects — discriminated stdin parsing with per-consumer fail polarity, source-bound enforcement caches, session-bound registry writes, boundary-based matching, and truthful audit emission, delivered as 8 scoped group modules.
>
> **Project**: bkit-claude-code (plugin v2.1.40)
> **Version**: 2.1.40
> **Author**: Claude Code (hook-audit-fix-wave-1028)
> **Date**: 2026-10-28
> **Status**: Draft
> **Planning Doc**: [hook-audit-fix-wave-1028.plan.en.md](../01-plan/features/hook-audit-fix-wave-1028.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 38 open reports document that the hook enforcement layer fails open at critical gates, trusts model-writable state, and reports outcomes that never happened — confirmed by executed probes. |
| **WHO** | The operator (all session Bash/Write/Stop traffic) and fix agents relying on the audit ledger. |
| **RISK** | Shared-root failure-polarity changes can over-block benign automation; deny-pattern rewrites can reopen rb007/rb008/rb013. |
| **SUCCESS** | Both active report dirs empty with verified resolutions; per-group probes green; cache synced; no suite regressions. |
| **SCOPE** | 8 modules (= wave groups G1-G8) in fix order, shared roots first. |

---

## 1. Overview

### 1.1 Design Goals

1. Failure polarity becomes an explicit, visible decision at every stdin consumer — never an accidental `|| {}`.
2. Enforcement state (directive caches, skill markers, automation levels) is bound to its real source and session.
3. Matching decisions (denies, doc-classes, preview flags) are boundary-based, not substring luck.
4. The audit ledger records what actually happened.
5. Every fix is probe-verified against the original report's verification commands before its report closes.

### 1.2 Design Principles

- Root-first ordering: shared roots (lib/core/_io, lib/defense) change before consumers.
- Fail-closed only at gates (PreToolUse Bash, Stop); advisory consumers fail open with a visible marker — never silently.
- No new lint suppressions, no comment trimming, bilingual docs for new docs/ files.
- Each group lands as one reviewable diff: fix + probes + report moves in the same unit.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | Per-report local patches; keep `|| {}` root | New input/polarity module; rewrite all 24 consumers | Discriminated result at the shared root; consumers declare polarity; shared helpers for cache/session binding; local fixes elsewhere |
| **New Files** | 1 (pdca-post-write.js) | 3-4 | 2 (pdca-post-write.js, small binding helper) |
| **Modified Files** | ~20 | ~26 | ~20 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Low (root persists) | High | High |
| **Effort** | Low | High | Medium |
| **Risk** | High (fail-open class survives) | Medium (big-bang across hot hooks) | Low |

**Selected**: Option C — the two High fail-opens share one root that a local patch cannot kill (rb043's whole point), while a full consumer rewrite (B) touches every hot hook at once and risks over-blocking. C fixes the root once, makes each consumer declare polarity, and shares one binding helper for the forged-anchor family.

---

## 2.1 Component Diagram

```
CC host envelope (stdin)
        │
        ▼
┌─────────────────────────────┐
│ lib/core/_io/readers.js     │  readStdinSync → {ok:true,payload} | {ok:false,reason}
│  (discriminated result,     │  + 10MB stdin cap, loud truncation marker
│   capped buffer)            │
└──────────┬──────────────────┘
           │ consumer declares polarity
   ┌───────┴────────┬──────────────────┐
   ▼                ▼                  ▼
GATES             ADVISORY           LEDGER
bash-pre,         session-start,     audit writers record
unified-stop      startup/*, small   true outcome vocabulary
(fail-CLOSED:     handlers           (observed|ask|blocked|
 ask/refuse)      (fail-OPEN+marker) dispatched)
   │                │                  │
   └───────┬────────┴──────────────────┘
           ▼
┌─────────────────────────────┐
│ Source-bound state          │  .bkit/runtime caches: valid only while
│  (mtime+hash binding,       │  source present & mtime+hash match;
│   sessionId fields)         │  markers carry sessionId, compared at Stop
└─────────────────────────────┘
```

## 2.2 Data Flow (gate decision path)

```
stdin bytes → parse (discriminated) → [gate: parse failed → ASK "could not validate"] →
guards in fixed order (cumulative, not short-circuit-coupled: every guard grades,
results merge to the strictest verdict) → verdict → single-contract emission →
audit row with TRUE outcome
```

## 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| All 24 handlers | lib/core/_io/readers.js | stdin parsing (polarity fix point) |
| unified-bash-pre.js | lib/defense/memory-enforcer.js | directive deny (cache-binding consumer) |
| unified-stop.js | lib/core/active-skill-marker.js | marker dispatch (sessionId binding) |
| hooks/session-start.js | .bkit/runtime/* | cache writer (validity binding writer side) |
| pdca-task-completed.js | lib/pdca/automation.js | auto-advance (session filter) |

---

## 3. Data Model

### 3.1 Key Structures

```js
// readers.js — discriminated stdin result
{ ok: true,  payload: <object>, truncated: false }
{ ok: false, reason: 'parse'|'empty'|'truncated', raw: <Buffer> }

// .bkit/runtime/memory-directives.json — bound cache entry
{ pattern, action, rule, source: 'CLAUDE.md',
  srcMtime: <epochMs>, srcHash: <sha256-8>, boundAt: <ISO> }

// .bkit/runtime/active-skill.json — session-bound marker
{ skill, feature, ts, sessionId: <CC session id> }

// Audit outcome vocabulary (replaces fabricated 'success'/'blocked')
'observed' | 'ask' | 'blocked' | 'dispatched' | 'dispatched_no_context'
```

### 3.2 Relationships

CLAUDE.md (source of truth) 1─1 bound via (mtime,hash)→ memory-directives cache; session 1─N markers via sessionId; feature registry rows stamped with ownerSession at every write path.

---

## 4. Interface Specification (hook contracts, not REST)

### 4.1 Gate Contract (PreToolUse Bash / Stop)

| Case | Old behavior | New behavior |
|------|--------------|--------------|
| parse ok | guards run | guards run (unchanged) |
| parse failed / empty / wrong key | `input={}` → silent ALLOW | emit ASK "hook could not validate this command" (bash-pre) / refuse ledger+gate writes with a debug row (unified-stop) |
| stdin > 10MB | unbounded growth | cap + truncated marker → same fail-closed path |

### 4.2 Emission Contract

One contract per path: PreToolUse gates emit `hookSpecificOutput.permissionDecision`; blocking emits exactly one of (structured stdout JSON, exit 2 + stderr reason) — never both (rb028); `continue:false` always carries `stopReason` (rb038/rb020).

---

## 5. (N/A — no UI; plugin hooks only)

---

## 6. Error Handling

### 6.1 Error Classes

| Class | Mechanism | Handling |
|-------|----------|----------|
| stdin degradation | parse fail/empty/truncation | fail-closed at gates; advisory consumers proceed with `+[degraded-input]` marker |
| source absent | directive cache w/o CLAUDE.md | cache VOIDED (deleted), never deny |
| module absent | pdca-post-write require | restored file; require wrapped, loud warn on failure |
| concurrent RMW | shared-state writes | lockedUpdate/atomic temp+rename at all shared paths |
| async overrun | fire-and-forget effects | awaited within timeout or queued; rejection handler logs (no process-wide swallower) |

---

## 7. Security Considerations

- [x] Deny/auto-approve decisions use resolved paths (containment) and word boundaries — no raw substrings (rb019/rb013/rb036; defense arm rb007/rb008/rb009)
- [x] Model-writable state never grants enforcement without source binding (rb016/rb022/rb030/rb041)
- [x] Session identity required for cross-session-sensitive writes (rb014/rb015/rb020/rb023/rb024/rb032/rb037)
- [x] Interpreter prefixes removed from allowlists (rb019)
- [ ] Live-CC probe for matcher alternation (rb042) — done once during Do, result documented either way

---

## 8. Test Plan

### 8.1 Test Scope (probe-verification, per group; code + probes = 1 set)

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| P1: syntax | every touched file | `bash -n`, `node --check` | Do |
| P2: unit/contract/regression | touched areas | tests/ suites (scoped run) | Do |
| P3: behavioral probes | original reports' verification commands, re-executed | direct handler invocation (audit probe shapes) | Do |
| P4: adversarial re-probe | RB5-1..RB5-6/8/9 chains that must now HOLD | red_baron scratch method | Do |

### 8.2 Key Probe Scenarios (expected POST-fix behavior)

| # | Probe (from corpus) | Expected result after fix |
|---|---------------------|---------------------------|
| 1 | empty/truncated/garbage stdin → unified-bash-pre | ASK emitted (not silent allow) — RB5-3 held |
| 2 | CLAUDE.md line + rm CLAUDE.md → bash-pre | NO deny (cache voided) — RB5-4 held |
| 3 | `node -e '…'` / `docs/../../../x` at L2+ | human decision (no auto-approve) — RB5-1/2 held |
| 4 | forged active-skill marker + `printf '' \| unified-stop` | no handler dispatch; marker rejected (sessionId) — RB5-5 held |
| 5 | `git push -f` (end-of-string) | deny (pattern fixed) — RB5-6 held |
| 6 | genuine failure then clean turns (br878) | recovery text carries cmd+ts+exit; expected-failure probes emit nothing |
| 7 | rb007 quoted-SQL / rb008 where-prose / rb013 variants | detection intact (no regression) |
| 8 | audit ledger after ask/phantom dispatch | rows record ask/dispatched_no_context — RB5-9 held |

---

## 9. Architecture Fit (existing layering — no migration)

| Component | Layer | Location |
|-----------|-------|----------|
| stdin polarity | core lib | `lib/core/_io/readers.js` |
| cache/session binding helper | core lib | `lib/core/state-binding.js` (new, small) |
| gate fixes | hooks | `scripts/unified-*.js`, `scripts/pre-write.js` |
| matching semantics | defense | `lib/defense/*` |
| pdca-post-write (restored) | hooks | `scripts/pdca-post-write.js` |

Dependency rule: handlers → lib only; lib never requires scripts/ (preserved; the rb021 require direction scripts→scripts is a hook-internal arm, allowed).

---

## 10. Coding Convention Reference

Existing repo conventions apply (CommonJS, module docstrings, explicit error handling, no lint suppressions). New: audit outcome vocabulary (§3.1) and explicit fail-polarity declarations are required style for all stdin consumers.

---

## 11. Implementation Guide

### 11.1 File Structure (delta)

```
lib/core/_io/readers.js        (modified — discriminated result, cap)
lib/core/state-binding.js      (NEW — mtime+hash bind, void-on-absence, sessionId compare)
scripts/pdca-post-write.js     (NEW — restored minimal contract)
scripts/unified-bash-pre.js    (modified — fail-closed, merged verdicts, boundary flags)
scripts/unified-stop.js        (modified — gate order, require guard, child timeout, ledger truth)
scripts/permission-request-handler.js (modified — allowlist/containment)
hooks/session-start.js         (modified — cache writer binding, cwd, audit truth)
lib/defense/*                  (modified — rb007/rb008/rb009/rb013 matching)
+ ~12 small handlers           (per-report fixes, see plan §2.1 groups G6-G8)
```

### 11.2 Implementation Order

1. [ ] G1 fail-open-io (root first: readers.js → bash-pre → unified-stop → tool-failure)
2. [ ] G2 textual-matching-defense (lib/defense + probe battery before proceeding)
3. [ ] G3 permission-gate
4. [ ] G4 forged-anchor (state-binding.js introduced here, applied to rb022/rb030/rb041/rb016/rb014/rb015/rb012)
5. [ ] G5 registry-session-binding
6. [ ] G6 stale-schema-cwd
7. [ ] G7 inert-channels-false-audit
8. [ ] G8 contract-misc

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Est. Turns |
|--------|-----------|-------------|:---------------:|
| fail-open-io | `module-1` | readers.js discriminated result + gate consumers + tool-failure arm | 40-50 |
| textual-matching-defense | `module-2` | defense lib matching + probe battery | 30-40 |
| permission-gate | `module-3` | allowlist/containment rewrite | 20-30 |
| forged-anchor | `module-4` | state-binding.js + cache/marker/level binding | 40-50 |
| registry-session-binding | `module-5` | session filters on registry write paths | 30-40 |
| stale-schema-cwd | `module-6` | v2 keys, CLAUDE_PROJECT_DIR, janitor preserve-list | 30-40 |
| inert-channels-false-audit | `module-7` | channel registration + outcome vocabulary | 25-35 |
| contract-misc | `module-8` | pdca-post-write restore + shape/await/boundary fixes | 30-40 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Plan + Design | full | done |
| Session 2-9 | Do | `--scope module-1` … `module-8` (one per loop tick) | per map |
| Session 10 | Check + Report + Archive | full | 30-40 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-28 | Initial design — Option C selected, 8-module session guide | Claude Code |
