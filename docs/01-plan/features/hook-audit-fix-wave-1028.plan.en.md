# hook-audit-fix-wave-1028 Planning Document

> **Summary**: Resolve all 38 open bug/rb reports in 8 hook/codespace groups, shared roots first, until both active report directories are empty.
>
> **Project**: bkit-claude-code (plugin v2.1.40)
> **Version**: 2.1.40 (maintainer assigns release version)
> **Author**: Claude Code (hook-audit-fix-wave-1028 /loop)
> **Date**: 2026-10-28
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | The hook-audit-1028 relay (4 TS audit passes + red_baron round) confirmed 38 open defects across the plugin's hook layer: two High fail-opens sharing one root, a probe-confirmed Critical forged-directive chain, interpreter/traversal auto-approval at L2+, a dead PDCA post-write require, and systemic inert-channel/false-audit/stale-schema families. |
| **Solution** | Fix in 8 groups ordered by shared root (io readers → defense text-matching → permission gate → forged anchors → registry binding → stale-schema/cwd → inert channels → contract misc), dispatching scoped agents per group with pre-digested briefs from the consolidated matrix. |
| **Function/UX Effect** | Bash/Stop gates stop silently disabling on degraded input; the operator's own commands can no longer be hard-denied by deleted CLAUDE.md directives; PDCA post-write and StopFailure guidance become live; stale-context noise (br878 class) drops sharply. |
| **Core Value** | The enforcement layer does what it claims: fails closed where stakes are highest, binds enforcement state to its real sources, and records true outcomes in its audit trail. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 38 open reports (rb007-rb043, br878) document that the hook enforcement layer fails open at its critical gates, trusts model-writable state, and reports outcomes that never happened — confirmed by executed probes, not just code reads. |
| **WHO** | The operator (every session's Bash/Write/Stop traffic passes through these hooks) and downstream fix agents relying on the audit ledger. |
| **RISK** | Shared-root fixes (readers.js) can change failure polarity for every consumer — a fix that fails closed too aggressively could block benign automation; regressions in the deny-pattern rewrite could reopen rb007/rb008/rb013. |
| **SUCCESS** | Both `bug_reports/active/br/` and `bug_reports/active/rb/` empty (every report closed with verified resolution); per-group probes green; plugin cache synced; no regression in tests/ suites. |
| **SCOPE** | 8 groups in fix order: (1) fail-open-io root, (2) textual-matching-defense, (3) permission-gate, (4) forged-anchor, (5) registry-session-binding, (6) stale-schema-cwd, (7) inert-channels-false-audit, (8) contract-misc. |

---

## 1. Overview

### 1.1 Purpose

Close every open report in `bug_reports/active/{br,rb}/` with a verified fix, eliminating the confirmed fail-open, forged-anchor, auto-approval, dead-enforcement, and false-audit defect classes from the hook layer.

### 1.2 Background

The hook-audit-1028 relay (session `e1a4c426`, corpus in `work/hook-audit-1028/`) consolidated 38 findings into one report per hook (operator directive). Red_baron probes confirmed the top chains end-to-end (RB5-1 through RB5-9). The operator then ordered this fix wave by /loop (30m cron `592f3070`), requiring group-by-group resolution until both active directories are empty, then cron cancellation.

### 1.3 Related Documents

- Findings corpus: `work/hook-audit-1028/consolidated-matrix.md` (+ pass1-4/red-baron findings)
- Open reports: `bug_reports/active/rb/rb007..rb043`, `bug_reports/active/br/br878`
- Queue: `work/now.md` (hook-audit-fix-wave-1028)
- Workflow: `work/work.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] G1 fail-open-io: rb043 (readers.js fail-closed API + buffer cap), rb018 (bash-pre consumers + text-tier gaps), rb020 (unified-stop consumers + pre-gate dispatch + P4-B1 + child timeout), rb033 (tool-failure expected-failure arm + self-identifying context + RMW lock; closes br878)
- [ ] G2 textual-matching-defense: rb007 (quoted-SQL bypass), rb008 (where-prose suppression), rb009 (doc-exemption gaps), rb013 (deploy-deny patterns)
- [ ] G3 permission-gate: rb019 (remove interpreter prefixes, path containment, push -f pattern)
- [ ] G4 forged-anchor: rb022 (cache mtime+hash binding + void-on-absence), rb030 (phase enum validation + quoting), rb041 (version-cache validation), rb016 (control-state auth scope), rb014 (marker session binding), rb015 (fire-time session recording), rb012 (transcript containment)
- [ ] G5 registry-session-binding: rb023 (auto-advance session gate), rb024 (fallback removal + transcript cap), rb017 (updatePdcaStatus migration), rb010 (intake tokens)
- [ ] G6 stale-schema-cwd: rb029 (v1 keys), rb039 (cwd), rb025 (janitor preserve-list + RMW lock), rb037 (roster scoping), rb031 (swallower + fabricated L2 + audit)
- [ ] G7 inert-channels-false-audit: rb026 (StopFailure channel), rb027 (audit truth), rb035 (notification), rb038 (team-idle shape), rb042 (matcher alternation — one live-CC probe, may close as registration split)
- [ ] G8 contract-misc: rb021 (restore pdca-post-write.js), rb028 (block contract), rb034 (prompt shape), rb036 (path boundary), rb040 (await effects), rb032 (monotonic phase guard)

### 2.2 Out of Scope

- Host-side (Claude Code) replay behavior — plugin-side mitigation only (br159 precedent; upstream doc note in rb033).
- unified-stop.js 560-1040 + unified-bash-pre.js 1-260 adversarial line-reads (open veins for a FUTURE audit run; fix targets in this wave are the filed findings only).
- Version bumps (maintainer-only); new features beyond filed reports.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Parse failure of hook stdin yields an explicit fail-closed decision at PreToolUse Bash and Stop (ask/refuse), never silent allow (rb043/rb018/rb020) | High | Pending |
| FR-02 | memory-directives cache validity bound to CLAUDE.md mtime+hash; cache voided when source absent (rb022/rb018) | High | Pending |
| FR-03 | No interpreter prefixes (`node `, `npm run `) in permission auto-approve; write auto-approve requires resolved-path containment (rb019) | High | Pending |
| FR-04 | Deny/detection patterns use path/word-boundary matching, not raw substrings (rb013, rb036; defense arm of rb007/rb008/rb009) | High | Pending |
| FR-05 | Active-skill marker carries sessionId; Stop runs session-activity gates BEFORE handler dispatch (rb014/rb015/rb020) | High | Pending |
| FR-06 | Audit ledger records true outcomes (ask/blocked/observed), never fabricated 'blocked'/'success' on inert channels (rb027/rb031/rb020) | Medium | Pending |
| FR-07 | PDCA post-write require target exists and runs; StopFailure guidance reaches a delivering channel (rb021/rb026) | Medium | Pending |
| FR-08 | tool-failure recovery text self-identifying (command excerpt + ISO timestamp + exit code) and silent on expected failures (rb033/br878) | High | Pending |
| FR-09 | All state reads resolved from CLAUDE_PROJECT_DIR; dead v1 keys migrated (rb029/rb039/rb022/rb041) | Medium | Pending |
| FR-10 | Janitor preserves preference/postmortem state files (rb025); shared RMW writes locked (rb025/rb033) | Medium | Pending |
| FR-11 | Registry auto-advance/stamp paths filter by payload session_id (rb023/rb024/rb032) | High | Pending |
| FR-12 | Hook output shapes well-formed (single contract per path; continue:false carries stopReason) (rb028/rb038/rb034) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Correctness | No regression in existing suites | tests/ contract+regression+unit suites per group |
| Performance | No hook exceeds its registered timeout budget | spawnSync child timeouts ≤ 3s in 10s Stop; transcript reads capped in 5s hooks |
| Security | rb007-rb009/rb013/rb019 probe suites re-run green | group probe scripts + red_baron scratch probes re-executed |
| Compatibility | Live plugin cache synced per group; restart note for operator | sync_plugin_cache.sh --apply + drift check |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] All 38 reports closed: fix applied + original symptom probed + report moved to completed/ with Resolution section + INDEX rows updated
- [ ] Both active directories empty; cron 592f3070 deleted
- [ ] Per-group verification real: bash -n / node --check / targeted tests / behavioral probes (re-run of the audit's probe shapes)
- [ ] Plugin cache synced after final group; operator restart note delivered
- [ ] work/now.md queue updated at every tick; CHANGELOG entry drafted

### 4.2 Quality Criteria

- [ ] Zero new lint suppressions; no comment trimming
- [ ] Failure-polarity change documented in readers.js consumers (explicit fail-open/fail-closed choice per consumer)
- [ ] br878 replay phenomenon re-probed post-fix: stale context self-identifying (or silent)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Fail-closed flip blocks benign commands (over-correction of rb043/rb018) | High | Medium | Fail-closed emits ASK (human decides), not deny; probe with benign command battery before closing |
| Deny-pattern rewrite reopens rb007/rb008 (quoted SQL, where-prose) | High | Medium | G2 re-runs the full rb007/rb008/rb013 probe suites; GP-21 --flag regression guard retained |
| Shared-root change breaks advisory consumers that legitimately want fail-open | Medium | Medium | readers.js returns discriminated result; each consumer declares polarity explicitly |
| rb021 restore of pdca-post-write.js resurrects unknown expectations | Medium | Low | Reimplement minimal contract per the caller's usage at :43-53,175; suite-verify |
| Cross-group merge conflicts in unified-stop.js (G1+G4+G5 touch it) | Medium | High | Strict group order; exclusive file scopes per dispatch; commit per group |
| rb042 matcher alternation unresolvable without live CC | Low | High | One live-CC probe attempt; if inconclusive, close as documented registration split (defensible resolution) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| lib/core/_io/readers.js | lib (stdin parse) | fail-open `|| {}` → discriminated result + buffer cap |
| scripts/unified-bash-pre.js | hook | consumers declare fail-closed; text-tier matching fixes |
| scripts/unified-stop.js | hook | gate ordering, require guard, child timeout, ledger truth |
| scripts/permission-request-handler.js | hook | allowlist/containment rewrite |
| hooks/session-start.js + .bkit/runtime caches | hook + artifacts | cache validity binding, void-on-absence |
| scripts/pdca-post-write.js | hook (NEW file) | restored minimal implementation |
| defense lib (memory-enforcer, quoted-delete, phase9) | lib | matching semantics per rb007/rb008/rb009/rb013 |
| 12+ small handlers | hooks | per-report fixes (see group lists) |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| readStdinSync | READ | all 24 handlers via lib/core/io.js | Needs verification — polarity now explicit per consumer |
| memory-directives.json | READ | bash-pre Memory Enforcer | Needs verification — void path added |
| active-skill.json | READ/WRITE | unified-stop dispatch, skill-post writer | Needs verification — sessionId field added |
| updatePdcaStatus | WRITE | pre-write, pdca-task-completed, automation.js | Needs verification — session filter added |
| audit ledger writers | WRITE | config-change, session-start, unified-stop, bash-pre/post | Needs verification — outcome vocabulary change |

### 6.3 Verification

- [ ] Consumers listed above verified per group before closing its reports
- [ ] Deny-path regression battery (G-001/G-004/G-009/G-010b/G-019 probe shapes) green after G2
- [ ] Plugin cache drift-checked after every group; final `--apply` at wave end

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Selected: **Dynamic-equivalent (existing plugin architecture)** — bkit is an established Claude Code plugin; no level migration. Fixes conform to the existing scripts/ + lib/core + lib/{pdca,defense} layering.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Fail polarity API | per-consumer flags / discriminated result | Discriminated result from readStdinSync; consumer declares | Makes polarity visible at every call site (rb043 fix shape) |
| Directive cache validity | TTL / mtime+hash / re-read each time | mtime+hash + void-on-absence | Cheap per-call check; kills the RB5-4 chain at both ends |
| Marker session binding | sessionId field + compare | sessionId + Stop payload compare + gate order swap | Addresses rb014/rb015/rb020 with one mechanism |
| pdca-post-write.js | restore full / minimal contract | Minimal contract per caller usage | Unknown historical surface; suite verifies |
| Matching semantics | regex everywhere / segment+boundary | Path-segment + word-boundary where textual matching is the defect | Avoids new FP classes; preserves GP-21 guard |

### 7.3 Clean Architecture Approach

No structural migration. Group order keeps shared roots (lib/core/_io, lib/defense) ahead of their consumers so each group's diff is reviewable in one pass.

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `.claude/CLAUDE.md` conventions (language, versioning, cache sync)
- [x] work/work.md workflow (PDCA fire, scoped agents, bug handling)
- [x] Test suites under tests/ (contract, regression, unit, security)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| Fail polarity | implicit `|| {}` everywhere | explicit per-consumer declaration | High |
| Audit outcome vocabulary | 'success'/'blocked' misused | fixed vocabulary (observed/ask/blocked/dispatched) | Medium |

### 8.3 Environment Variables Needed

None new. `hooks.advisory.*` gating keys extended only if a new advisory emitter is introduced (default false per br146 precedent).

---

## 9. Next Steps

1. [ ] Design document (`hook-audit-fix-wave-1028.design.md`, bilingual pair)
2. [ ] Do phase: G1 dispatch (readers.js + bash-pre + unified-stop + tool-failure), then G2-G8 in order
3. [ ] Check per group (probe re-runs), report + archive at wave end

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-28 | Initial draft — 8-group wave plan from hook-audit-1028 corpus | Claude Code |
