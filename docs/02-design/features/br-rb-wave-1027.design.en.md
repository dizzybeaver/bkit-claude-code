# br-rb-wave-1027 Design Document

> **Summary**: Three minimal scoped fixes closing rb006, br164/br166, br165, plus a both-direction wave probe suite.
>
> **Project**: bkit-claude-code
> **Version**: 2.1.40 (no bump)
> **Author**: dizzybeaver (agent session)
> **Date**: 2026-10-27
> **Status**: Draft
> **Planning Doc**: [br-rb-wave-1027.plan.en.md](../01-plan/features/br-rb-wave-1027.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | False failure labels, unarchivable registry debris, and prose-blocking write gates each cost turns and degrade real signal. |
| **WHO** | Every Claude Code session running bkit hooks. |
| **RISK** | Over-suppression — probes cover both directions per fix (FP silenced AND true positive retained). |
| **SUCCESS** | Wave probes pass; suites + battery green; 4 reports archived; plugin synced; branch pushed. |
| **SCOPE** | 3 files + 1 probe file + docs/reports; no dispatcher or schema changes. |

---

## 1. Overview

### 1.1 Design Goals

- Each fix is the minimal evidence-tightening that kills the FP without masking the true positive.
- Three exclusive file scopes — parallel-safe agent dispatch.
- Every suppression leaves a debugLog trail (FR-04).

### 1.2 Design Principles

- Fail-open to today's behavior when evidence is absent or unparseable (no new failure modes).
- Reuse existing validators (`lib/pdca/validate-name.js`) over new parsing logic.

---

## 2. Architecture Options

| Criteria | Option A: Minimal (SELECTED) | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 3 in-place evidence guards + normalization at the single write site | Shared exit-code/intent-classifier module consumed by all hooks | A + merge stranded sibling keys |
| **New Files** | 1 (probe suite) | 2+ + rewiring | 1 + registry surgery |
| **Risk** | Low | Medium (behavior drift across all hooks) | Medium (G-020 registry writes) |
| **Verdict** | Hotfix-class; smallest correct change | Deferred until a 2nd consumer needs it | Out of scope (sanctioned paths can't merge keys) |

---

## 3. Data Model

N/A — no schema changes. Registry keys become contract-conformant single tokens going forward; existing stranded keys documented, not migrated.

---

## 4. API Specification

N/A — hook scripts. Output contracts unchanged (`outputEmpty`/`outputAllow`/existing JSON shapes).

---

## 5. UI/UX Design

N/A.

---

## 6. Error Handling

| Case | Behavior |
|------|----------|
| FR-01: no parseable exit code in input | Keep current classification (fail-open to today) |
| FR-01: exit code parses to 0 | No failure guidance; `outputEmpty`-class allow; debugLog `exit0-suppressed (wave1027 FR-01)` |
| FR-02: feature arg single token already | Byte-identical behavior (normalization is identity) |
| FR-02: feature arg missing/invalid | Existing fallback (primaryFeature) unchanged |
| FR-03: payload not matched by G-010b | Pass through (unchanged) |

---

## 7. Security Considerations

- FR-01 tightens a failure classifier — the direction of change is FEWER false alarms; genuine failures (non-zero parseable code) unchanged.
- FR-03 tightens G-010b with a determiner guard — unscoped `DELETE FROM <table>` still detected (probe-enforced).
- No new input sources; no suppression can turn a real destructive op into an allow.

---

## 8. Test Plan

Wave probe file `tools/brfix-wave-probes/wave1027_probes.js` (spawn style per `rb005_probes.js`; tmpdir fixtures; `CLAUDE_PROJECT_DIR`/`CLAUDE_PLUGIN_DATA` isolated):

| ID | Fix | Scenario | Expected |
|----|-----|----------|----------|
| T1 | FR-01 | Hook input: Bash, error string contains "non-zero" but parseable exit code 0 (`exit code: 0`) | NO exit_nonzero recovery guidance; empty/allow output |
| T2 | FR-01 | Error string with genuine `exit code: 1` | exit_nonzero guidance retained |
| T3 | FR-01 | Error string mentions "non-zero" with NO parseable code (today's ambiguous shape) | current behavior (classified) |
| T4 | FR-02 | Skill-fire effects with args `plan myfeature — some prose notes` → status write | ONE key `myfeature`; no key containing "— " |
| T5 | FR-02 | Args `do myfeature` (clean) | key `myfeature` unchanged (identity) |
| T6 | FR-03 | G-010b pattern test: "config key create/delete from the dashboard" | no match |
| T7 | FR-03 | `DELETE FROM audit_log;` (no WHERE) | still matches |
| T8 | FR-03 | `DELETE FROM audit_log WHERE id=1` | no match (WHERE present) |
| T9 | FR-03 | Full PreToolUse:Write of br165 repro payload to a new .md file | write NOT denied |
| T10 | syntax | `node --check` × 3 files | exit 0 |
| T11 | FR-01 live | error string shape from THIS session's specimens ("Bash command exited with non-zero status." — no code digits) | treated per T3 (classified) unless a code is present — documented outcome |

Plus: targeted suites touching the 3 files (grep tests/ for their names) + full battery.

---

## 9. Clean Architecture

N/A — in-place guards.

---

## 10. Coding Convention Reference

- Comment tags: `// rb006:`, `// br164/br166:`, `// br165:` (sibling style).
- `const` only; no new requires except `validate-name` in skill-invocation-effects (already required in-repo elsewhere).

---

## 11. Implementation Guide

### 11.1 Module Map (exclusive scopes — 3 parallel agents)

| Module | File (EXCLUSIVE) | Change |
|--------|------------------|--------|
| M1 | `scripts/tool-failure-handler.js` | FR-01 evidence guard in `classifyFailure` |
| M2 | `lib/orchestrator/skill-invocation-effects.js` | FR-02 normalize `invocationArgs.feature` once after line 146 |
| M3 | `lib/control/destructive-detector.js` | FR-03 G-010b determiner guard (line 216 pattern) + markdown-target exemption if needed for T9 |

### 11.2 Implementation Order (per module)

1. **M1**: (a) TRIAGE — at hook start, debugLog the RAW input JSON (tool_name, error, keys of tool_input/tool_response if present) so the next live firing records the true payload shape (rb006's own triage prescription). (b) before the `exit_nonzero` return, extract code via `/exit (?:code|status)[:\s]*(\d+)/i` from the error string (also check `input.tool_response` for an exit field if present). Code === 0 → return a `success_suppressed` no-op classification (empty guidance, debugLog). Code non-zero or absent → unchanged. Live specimen note: the observed error string ('Bash command exited with non-zero status.') carries NO digits — T11 documents this staying classified until the triage capture proves a safer evidence source.
2. **M2**: after `const invocationArgs = args || {};` (line 146), if `invocationArgs.feature` is a string, normalize: `String.split(/\s+/)[0]`, strip em-dash fragments, route through `require('../../pdca/validate-name').normalizeFeatureName` when available; drop invalid → undefined (existing fallbacks apply). debugLog when normalization changed the value.
3. **M3**: modify the G-010b pattern (line 216) to add a negative lookahead for English determiners/possessives after FROM: `(?!the\b|a\b|an\b|this\b|that\b|these\b|those\b|my\b|our\b|your\b|its\b)`. Verify T6/T7/T8 against the pattern directly; if T9 (full Write repro) still denies via a DIFFERENT rule (G-005 companion), extend the guard to that rule's prose path with the same evidence bar and note it in the module report.
4. MAIN runs the probe suite + suites + battery after all three land (testing handoff).

### 11.3 Session Guide

| Module | Agent | Deadline |
|--------|-------|----------|
| M1 | fix agent A | 10 min (cron-armed) |
| M2 | fix agent B | 10 min (cron-armed) |
| M3 | fix agent C | 10 min (cron-armed) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-27 | Wave design — Option A, 3 exclusive scopes | dizzybeaver (agent) |
