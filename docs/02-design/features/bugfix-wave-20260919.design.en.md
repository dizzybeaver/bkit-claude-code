# bugfix-wave-20260919 Design Document

> **Summary**: Six targeted fixes to bkit's enforcement and PDCA bookkeeping, each anchored to verified code sites, with both-sides regression tests.
>
> **Project**: bkit (bkit-claude-code)
> **Author**: Claude Code (L4 full-auto)
> **Date**: 2026-09-19
> **Status**: Draft
> **Planning Doc**: [bugfix-wave-20260919.plan.en.md](../01-plan/features/bugfix-wave-20260919.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Gate/hook defects block legitimate work — enforcement layer failing its own users. |
| **WHO** | bkit users running agent-orchestrated PDCA cycles; the enforcement layer itself. |
| **RISK** | Detector changes weakening real protection; gate relaxation admitting incomplete cycles. |
| **SUCCESS** | All 6 reports verifiably fixed (regression tests), CHANGELOG written, installed plugin synced. |
| **SCOPE** | 6 fixes: G-001/G-013 targetFields, archive write order, orphan-row cleanup, matchRate recording + gate relaxation, feature resolution, StopFailure parsing. |

---

## 1. Overview

### 1.1 Design Goals

- Fix the defect class, not the member: reuse the targetFields mechanism from G-020 rather than special-casing G-001.
- Ground truth over registry: archive gate trusts docs-on-disk when registry bookkeeping failed.
- No protection regression: every detector change ships a both-sides test (malicious still denied, legitimate now allowed).

### 1.2 Design Principles

- Minimal diff at verified anchors (Option A - Minimal Changes) - surgical bug fixes, not a refactor.
- Fail-closed preserved: gate relaxations require affirmative evidence (phase >= report AND all 4 docs exist).
- Registry remains locked (G-020): orphan cleanup goes through sanctioned lib APIs only.

**Selected**: Option A (Minimal Changes) - 6 orthogonal defects in a mature codebase. Auto-selected under L4 (AskUserQuestion banned by user directive).

---

## 2. Component Diagram

```
Write/Edit --> pre-write.js --> destructive-detector.detect() --> G-001/G-013 (targetFields: command only)
Bash       --> unified-bash-pre.js --> detect() --> G-001/G-013 (full command coverage, unchanged)

gap-detector agent --Stop--> gap-detector-stop.js --> extractFeature (fixed) --> parse matchRate (table+plain)
                                                                              \-> status-core record
pdca-archive CLI --> gate: completed OR matchRate>=90 OR (phase>=report AND 4 docs on disk)
archiveFeature    --> updatePdcaStatus('archived')  [status-first order verified]
StopFailure       --> stop-failure-handler.js --> classifier (real fields) --> error-log.json
orphan rows       --> status-cleanup sanctioned path (docs-missing proof required)
```

---

## 3. Detailed Design (per fix)

### Fix 1 - G-001/G-013 targetFields (RB-003)

`lib/control/destructive-detector.js`:
- Add `targetFields: ['command']` to the G-001 rule row (lines 39-62) and G-013 (lines 252-260), mirroring G-020's declaration (lines 431-438). The detect() branch at lines 1296-1301 already honors `targetFields` - no detect() change.
- Effect: for Write/Edit toolInput (no `command` field), G-001/G-013 never match content/file_path. For Bash, `toolInput.command` is judged exactly as before.
- Tests (test/unit/destructive-detector.test.js additions):
  - `detect('Write', {file_path:'tests/x.py', content:'import shutil\nshutil.rmtree(p)'})` -> NOT denied.
  - `detect('Bash', {command:'rm -rf /tmp/x'})` -> STILL denied.
  - `detect('Bash', {command:'find . -exec rm {} \;'})` -> STILL denied (G-013).
  - `detect('Write', {content:'docs about find -delete'})` -> NOT denied.

### Fix 2 - archiveFeature write order (archive-phase-write report)

Measured present state: `archiveFeature` (lifecycle.js:138-174) already writes `updatePdcaStatus('archived', ...)` BEFORE `removeActiveFeature`, and `moveDocsToArchive` no longer exists in lib - the CLI moves docs. The report's failure mode (doc gate runs after docs left) is structurally absent in current code, but the doc gate itself (`requireDocs` default true) can still silently skip the archived write when docs are already gone (the CLI-applied archive case).
- Action: pass `opts.requireDocs: false` on the archive-phase `updatePdcaStatus` call in lifecycle.js - an archived feature by definition has left its docs' source location; the doc gate is meaningless for this transition.
- Test: with docs absent, `archiveFeature` persists `phase:'archived'` + `archivedTo` (today the silent-skip path when shouldUpdate fires).

### Fix 3 - orphan-row sanctioned cleanup (BR-001)

`lib/pdca/status-cleanup.js` `deleteFeatureFromStatus` (lines 39-49):
- Add a sanctioned orphan path: allow deletion when docs are provably absent at canonical paths AND phase is non-terminal - returns `{success: true, reason: 'orphan-removed (docs missing)'}`. Docs-missing proof reuses the shouldUpdate doc-check (neither plan nor design doc exists).
- `lib/pdca/feature-manager.js`: no cap redesign; `canStartFeature` keeps counting active rows, but the cleanup path makes orphans removable so the 3-cap is recoverable.
- Exposed via the existing `/pdca cleanup {feature}` action - no new CLI.
- Test: orphan row (phase 'do', no docs) -> deleteFeatureFromStatus succeeds; live feature (phase 'do', docs present) -> still refused.

### Fix 4 - matchRate recording + archive gate (RB-002 + BR-002)

`scripts/gap-detector-stop.js` (lines 67-98):
- Fix regex ordering: `(Overall\s+Match Rate|Match Rate|매치율|일치율|Design Match)[^0-9]*(\d+)` - bare `Overall` must not win; the `[^0-9]*` gap already tolerates table form (`Overall Match Rate | 98%`).
- Fix feature resolution: the current call `extractFeatureFromContext({agentOutput, currentStatus})` passes keys its signature (status-core.js:403 reads `sources.feature` / `sources.filePath`) ignores - guaranteeing the primaryFeature fallback. Pass `{feature: featureMatch?.[1], filePath: undefined}` instead, keeping the regex match as the primary source.
- Wrong-feature guard: if the resolved feature is not the primaryFeature AND not in activeFeatures, record nothing + emit a parseWarning instead of writing to a stale feature (prevents BR-002's misattribution).

`scripts/pdca-archive.js` gate (lines 104-139):
- Extend: `gatePassed = completed || matchRate >= 90 || (phaseNumber(phase) >= phaseNumber('report') && discoverDocs(feature).missing.length === 0)`. Docs-on-disk is ground truth (RB-002 Fix-2).
- Tests: gate passes for phase 'report' + 4 docs on disk + matchRate null; still fails for phase 'do' + docs present.

### Fix 5 - StopFailure payload parsing (stop-failure-payload report)

`scripts/stop-failure-handler.js` (lines 30-59):
- Add `last_assistant_message` as an errorMessage source (string or `{content:[{text}]}` shape).
- When `input.error` is a plain string, use it as the message (currently only object shapes handled) and feed it through the existing classifier so category/severity are real.
- parseStatus: zero-useful-field payloads stay unknown/low; 'partial' only when SOME fields found but message extraction failed.
- Test: payload with only `error: "Exit code 2"` -> entry has a real message + classified severity, not unknown/low/empty.

### Fix 6 - pre-patch triage

Reports may cite code that has since moved (already demonstrated: moveDocsToArchive no longer exists). Do-phase step 0: re-verify each report's file:line against HEAD; where the defect is already gone, close the report as `fixed-elsewhere` with measured evidence instead of writing a no-op patch.

---

## 4. Data Design

No schema changes. Registry fields consumed: `phase`, `matchRate`, `activeFeatures`, `archivedTo`. error-log entry shape unchanged (only field values improve).

---

## 5. Test Plan

L1 unit (test/unit/):
- destructive-detector: 4 both-sides cases (Fix 1).
- status-cleanup: orphan vs live deletion (Fix 3).
- archive gate: docs-on-disk pass/fail cases (Fix 4).
- stop-failure-handler: payload variants -> classified entries (Fix 5).
- lifecycle: archive persists with docs absent (Fix 2).

L2 integration: `node test/run-all.js --unit --integration --regression` full pass.
L3 E2E: real probe - `pdca-archive.js` dry-run against this repo's own feature at archive time (dogfood).

---

## 6. Implementation Guide

### 6.1 Module Map

| Module | Scope key | Files |
|--------|-----------|-------|
| module-1 detector | G-001/G-013 targetFields + tests | lib/control/destructive-detector.js, test/unit/destructive-detector.test.js |
| module-2 archive | lifecycle requireDocs:false + gate relaxation + tests | lib/pdca/lifecycle.js, scripts/pdca-archive.js, test/unit/* |
| module-3 bookkeeping | gap-detector-stop + orphan cleanup + tests | scripts/gap-detector-stop.js, lib/pdca/status-cleanup.js, test/unit/* |
| module-4 observability | stop-failure-handler + tests | scripts/stop-failure-handler.js, test/unit/* |

### 6.2 Recommended Session Plan

1. Session 1: modules 1+2 (detector + archive).
2. Session 2: modules 3+4 (bookkeeping + observability).
3. Session 3: triage (Fix 6), report moves, CHANGELOG, plugin sync.

### 6.3 Implementation Order

Fix 1 -> Fix 2 -> Fix 4 -> Fix 3 -> Fix 5 -> Fix 6. Estimated ~150 changed lines + ~200 test lines.

---

## 7. Security Considerations

- G-001/G-013 remain fully enforced on the Bash surface (the only surface that executes deletion). Write/Edit content matching loses zero real protection - a Write executes nothing.
- Archive gate relaxation requires affirmative disk evidence; no fail-open path added.
- Orphan cleanup requires docs-absent proof; active features with docs stay protected.

---

## 8. Test Plan (QA gate)

All unit+integration+regression green; detector both-sides tests demonstrated RED-before/GREEN-after via mutation check.

---

## 9. Deployment / Sync

Copy exactly the changed files into the installed plugin root (recorded at Do time from `~/.claude/plugins/cache/bkit-marketplace/bkit/2.1.38/`). Sync manifest recorded in the completion report.

---

## 10. Risks

| Risk | Mitigation |
|------|-----------|
| Installed cache dir is versioned (2.1.38); sync lost on plugin update | Repo is source of truth; sync manifest documented; version bump left to maintainer |
| Report drift (code moved since filing) | Fix 6 triage re-verifies every cite before patching |

---

## 11. Implementation Guide (Session Guide)

Module Map 6.1; three-session split 6.2. `/pdca do bugfix-wave-20260919 --scope module-N` supported. Design Ref comments at each fix site: `// Design Ref: section 3 Fix N - rationale`.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-19 | Initial design; anchors verified via Explore dispatch | Claude Code |
