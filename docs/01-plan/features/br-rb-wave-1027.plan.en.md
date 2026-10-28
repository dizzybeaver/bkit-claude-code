# br-rb-wave-1027 Planning Document

> **Summary**: One wave cycle closing all four open reports — rb006 (PostToolUseFailure exit-0 misclassification), br164+br166 (same defect: full arg string registered as PDCA feature key), br165 (G-010b SQL-prose false positive).
>
> **Project**: bkit-claude-code
> **Version**: 2.1.40 (no bump)
> **Author**: dizzybeaver (agent session)
> **Date**: 2026-10-27
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Three hook defects pollute agent context: the failure handler labels verified exit-0 Bash calls "non-zero failures" (rb006); PDCA skill fires with prose args strand one registry key per phase, breaking archive-by-name (br164/br166); the destructive-write detector blocks markdown writes containing the English phrase "delete from" (br165). |
| **Solution** | Three scoped fixes in three exclusive files: exit-code evidence required before `exit_nonzero` classification (scripts/tool-failure-handler.js); feature-token normalization at registry write (lib/orchestrator/skill-invocation-effects.js); G-010b scoped to SQL-statement shape (lib/control/destructive-detector.js). |
| **Function/UX Effect** | Exit-0 commands stop surfacing failure guidance; PDCA cycles with descriptive fire args register one clean key and archive by name; doc writes with SQL-shaped English prose pass the write gate. |
| **Core Value** | Failure signal fidelity restored (real failures stand out), registry integrity under natural usage, and no forced prose rewording. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | False failure labels, unarchivable registry debris, and prose-blocking write gates each cost turns and degrade real signal; all four reports are open today. |
| **WHO** | Every Claude Code session running bkit hooks (failure classifier, skill-fire effects, Write pre-tool gate). |
| **RISK** | Over-suppression: the failure classifier must still catch GENUINE non-zero exits; G-010b must still catch real unscoped `DELETE FROM <table>`. Probes cover both directions. |
| **SUCCESS** | Wave probes pass (exit-0 silenced + real failure kept; prose-arg fire registers ONE clean key; "delete from the dashboard" passes + "DELETE FROM t" still blocked); suites + battery green; 4 reports archived; plugin synced; branch pushed. |
| **SCOPE** | 3 files changed + wave probe file; report archival of rb006/br164/br165/br166; CHANGELOG; cache sync; push. |

---

## 1. Overview

### 1.1 Purpose

Close the four open defect reports in one cycle (operator directive: "resolve all bug reports and rb reports … in 1 pdca").

### 1.2 Background

- rb006: classifier at `scripts/tool-failure-handler.js:67` substring-matches `err.includes('exit code') || err.includes('non-zero') || err.includes('exit status')`. Live specimens this session: repeated PostToolUseFailure flags on verified exit-0 commands (complete output printed). Upstream event source may mislabel; bkit-side fix is defensive evidence-checking (report Fix item 2).
- br164/br166 (same defect, br166 has the precise site): `lib/orchestrator/skill-invocation-effects.js` — `invocationArgs = args || {}` (line 146); the registry write at line 278 (`updatePdcaStatus(feature, …)`) and decision trace at 253 consume `invocationArgs.feature` un-normalized, so "phase feature — prose" keys the WHOLE string. The session-record path in the same file (`parseSessionSkillArgs`, lines 101–130) already tokenizes correctly (first non-flag token) — the fix reuses that normalization for the feature used by ALL downstream consumers. `scripts/pdca-skill-stop.js` `parsePdcaSkillArgs` (br066) + `lib/pdca/validate-name.js` are the reference implementations.
- br165: G-010b pattern at `lib/control/destructive-detector.js:216` — `/\bDELETE\s+FROM\s+[\w.]+(?![\s\S]*\bWHERE\b)/i` — already requires an identifier after FROM, but English determiners ("the", "a") match `[\w.]+`, so prose "create/delete from the dashboard" fires. Companion G-005 fired on the same payload; the fix's acceptance test is the report's exact repro (the Write must pass), whatever rule combination is responsible.

### 1.3 Related Documents

- bug_reports/active/rb/rb006-…, bug_reports/active/br/br164-…, br165-…, br166-…
- Prior art: br066 (stop-handler tokenizer), br143 (session-activity gate), br163 (destructive-detector arm discipline).

---

## 2. Scope

### 2.1 In Scope

- [ ] FR-01 rb006: exit-code evidence check before `exit_nonzero` classification.
- [ ] FR-02 br164/br166: feature-token normalization for the registry write + decision trace.
- [ ] FR-03 br165: G-010b SQL-shape scoping (determiner guard and/or markdown-target exemption) such that the report's repro write passes.
- [ ] Wave probes `tools/brfix-wave-probes/wave1027_probes.js` (both directions per fix); suites + battery; 4 reports archived with evidence; CHANGELOG `[Unreleased]`; cache sync; push.

### 2.2 Out of Scope

- Upstream CC event-source emission behavior (rb006 fix item 1 — not bkit code).
- Merging/cleaning already-stranded sibling registry keys (stagehunt-wave1-fix etc.) — unremovable by sanctioned means (G-020; cleanup only removes archived); documented, not scripted.
- br164's addendum (E-ARCH-GATE for Task-less harnesses) — already solved by the br005a report→completed clause this session verified; noted in report closure.
- br165's sibling note (stale INDEX "next free" line) — corrected during archival.

---

## 3. Requirements

| ID | Requirement | Priority | Report |
|----|-------------|----------|--------|
| FR-01 | When the hook input carries a parseable exit code (from the error string, e.g. `/exit (?:code|status)[:\s]*(\d+)/i`, or from tool_response) and that code is 0, do NOT classify `exit_nonzero` — emit no failure guidance (empty/allow output). Genuinely non-zero or unparseable keeps today's behavior. | High | rb006 |
| FR-02 | `invocationArgs.feature` is normalized to a single registry key token before ANY consumer (decision trace line 253, status write line 278): first whitespace-delimited token, em-dash prose stripped, routed through `lib/pdca/validate-name.js` normalization (same contract as `parsePdcaSkillArgs`). | High | br164/br166 |
| FR-03 | G-010b must not match English prose: after `DELETE FROM`, a determiner/article lead-in ("the", "a", "an", possessives, demonstratives) or markdown/text file targets must not fire; real `DELETE FROM <table>` with no WHERE still fires. The br165 repro ("config key create/delete from the dashboard" in a NEW .md Write) must pass the gate. | High | br165 |
| FR-04 | Each fix ships both-direction probes (FP silenced AND true positive retained) + debugLog on each new suppression. | Medium | all |

---

## 4. Success Criteria

- [ ] All probes pass; `node --check` clean on all 3 files; targeted suites + full battery 0 failed.
- [ ] Live rb006 reproduction (this session's repeated flags) covered by a probe: exit-0 error string "non-zero" → no failure output.
- [ ] 4 reports moved to completed/ with real verification; INDEX files updated; CHANGELOG entry; cache synced; branch pushed; cron cancelled.

---

## 5. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| FR-01 masks real failures whose error string lacks a parseable code | Silent real failures | Unparseable code keeps current behavior (fail-open to today); probes assert real non-zero still classified. |
| FR-02 changes keys for existing legit multi-word features? | Registry key drift | Legit feature keys are single tokens by contract (validate-name); normalization only strips what the contract already forbids. Probes: clean single-token name unchanged. |
| FR-03 weakens SQL detection | Missed unscoped DELETE | Both-direction probes: `DELETE FROM audit_log;` still blocked; WHERE'd DELETE still passes. |

---

## 6. Impact Analysis

| Resource | Consumer | Impact |
|----------|----------|--------|
| tool-failure-handler.js classifyFailure | hooks.json PostToolUseFailure | Output suppressed only when evidence says exit 0 |
| skill-invocation-effects.js feature consumers (253, 278) | orchestrator post-skill hook | Key normalized; session-record path untouched (already tokenized) |
| destructive-detector.js G-010b | PreToolUse:Write + Bash scans | Prose no longer fires; SQL shapes unchanged |

---

## 7. Next Steps

1. [ ] Design doc (bilingual) — Option A minimal per fix, three exclusive file scopes
2. [ ] Do: 3 scoped fix agents (testing handoff), MAIN runs probes/suites/battery
3. [ ] Check (gap-detector) → Report → Archive → cache sync → push → close reports → cancel cron

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-10-27 | Wave plan: rb006 + br164/166 + br165 | dizzybeaver (agent) |
