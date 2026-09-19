# bugfix-wave-20260919 Planning Document

> **Summary**: Resolve the 6 open bug reports in `bug_reports/` via a full PDCA cycle, then sync changes into the installed bkit plugin and update the CHANGELOG.
>
> **Project**: bkit (bkit-claude-code)
> **Version**: 2.1.38 (repo) / 2.1.39 unreleased in progress
> **Author**: Claude Code (orchestrated, L4 full-auto per user directive)
> **Date**: 2026-09-19
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Six open bug reports describe real defects: two archive/state-bookkeeping dead-ends (orphan registry rows; archive status-write silently gated out), two false-positive/gate-blocking detector issues (G-001 token-presence on Write content; dispatched-agent matchRate never recorded so the archive gate can never pass), and two observability gaps (StopFailure payload fields unclassified; gap-detector-stop attributing matchRate to the wrong feature). |
| **Solution** | One PDCA wave feature fixing all six: (1) G-001/G-013 `targetFields: ['command']` declaration; (2) archive flow writes status BEFORE/after doc move without the requireDocs gate blocking; (3) sanctioned orphan-row cleanup path in feature-manager; (4) SubagentStop matchRate parser accepts table form + relax archive gate when all docs exist on disk; (5) gap-detector-stop feature resolution strengthened (parse kebab-case, prefer agent-claimed feature); (6) StopFailure classifier extracts real fields from the payload keys it already lists. |
| **Function/UX Effect** | Agents stop being blocked from writing legitimate test/doc content; agent-orchestrated PDCA cycles can actually archive; stale rows stop consuming the 3-feature cap; failure logs become actionable. |
| **Core Value** | Restores the operator guarantee that "PDCA must run ALL phases via proper Skill fires" is satisfiable, and removes self-blocking false positives from the enforcement layer. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Gate/hook defects block legitimate work (writes denied, archives dead-end, registry rows leak) — the enforcement layer is failing its own users. |
| **WHO** | bkit plugin users running agent-orchestrated PDCA cycles; the operator's enforcement layer. |
| **RISK** | Destructive-detector changes could weaken real protection — Bash path must keep full G-001 coverage; archive-gate relaxation must not let incomplete cycles archive. |
| **SUCCESS** | All 6 reports verifiably fixed (regression tests both sides), CHANGELOG entry written, changes synced to the installed plugin at `~/.claude`, reports moved to `completed/`. |
| **SCOPE** | 6 fixes in one wave: destructive-detector G-001/G-013, lifecycle archive write order, orphan-row cleanup, SubagentStop matchRate + archive gate relaxation, gap-detector-stop feature resolution, StopFailure payload parsing. |

---

## 1. Overview

### 1.1 Purpose

Fix every open defect report in `bug_reports/` (3 flat-layout + 2 in `active/br/`), verify each fix with true tests, then propagate the changes to the installed plugin copy under `~/.claude` so live sessions benefit.

### 1.2 Background

The reports were filed 2026-07-02 through 2026-09-19 across bkit itself and its enforcement layer. Two of them (RB-002, BR-002) describe the same failure class from different angles: registry bookkeeping for dispatched-agent PDCA cycles never lands, so the archive gate permanently blocks. The others are independent.

### 1.3 Related Documents

- `bug_reports/archive-phase-write-gated-out-after-doc-move.md`
- `bug_reports/stop-failure-payload-missing-fields.md`
- `bug_reports/rb002-dispatched-agent-pdca-matchrate-not-recorded-archive-gate-blocks.md`
- `bug_reports/rb003-g001-write-content-recursive-delete-fp.md`
- `bug_reports/active/br/br001-…md`, `br002-…md`

---

## 2. Scope

### 2.1 In Scope

- [ ] RB-003: declare `targetFields: ['command']` on G-001 (and audit G-013 find-deletion for the same class) in `lib/control/destructive-detector.js`
- [ ] archive-phase-write: reorder `archiveFeature` so `updatePdcaStatus('archived')` is not silently gated out by `requireDocs` after docs moved (`lib/pdca/lifecycle.js`)
- [ ] BR-001: sanctioned cleanup path for orphan registry rows (docs archived/missing but phase non-terminal) in `lib/pdca/feature-manager.js` / `status-cleanup.js` or the archive CLI
- [ ] RB-002 + BR-002: SubagentStop/gap-detector-stop matchRate recording — accept table-form rates, resolve feature from agent output with kebab-case-safe parsing, avoid wrong-feature `primaryFeature` fallback; relax archive gate when phase ≥ report and all 4 docs exist on disk
- [ ] StopFailure payload: classify real fields from listed payload keys (errorType/category/severity no longer collapse to unknown/low)
- [ ] Regression tests for each fix (fail-when-broken assertions, both sides where detector rules are touched)
- [ ] CHANGELOG entry (unreleased heading, no version bump per project rules)
- [ ] Sync changed files into the installed plugin at `~/.claude` (path resolved at Do phase from the session's actual plugin cache)

### 2.2 Out of Scope

- Bash quoted-argument token-presence class (residual noted in RB-003 — separate RB)
- Registry `MAX_CONCURRENT_FEATURES` cap redesign beyond orphan-row cleanup
- Any version bump in `.claude-plugin/plugin.json` (maintainer decision)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | G-001 matches only the Bash command surface; Write/Edit content mentioning `rm -rf`/`shutil.rmtree` is not denied | High | Pending |
| FR-02 | `detect('Bash', {command: 'rm -rf /tmp/x'})` still detected (protection unchanged) | High | Pending |
| FR-03 | `archiveFeature` persists `phase='archived'` + `archivedTo` even when docs already moved | High | Pending |
| FR-04 | Orphan rows (non-terminal phase, docs missing) have a sanctioned removal path that does not require hand-editing the registry | High | Pending |
| FR-05 | matchRate recorded from agent output in table form (`Overall Match Rate | 98%`) and plain form | High | Pending |
| FR-06 | gap-detector-stop never attributes a rate to a feature the agent did not analyze (no silent primaryFeature fallback when output names another feature) | High | Pending |
| FR-07 | Archive gate accepts phase ≥ report when all 4 docs exist at canonical paths | Medium | Pending |
| FR-08 | StopFailure entries carry real errorType/category/severity when payload fields are present | Medium | Pending |
| FR-09 | Each fix has a regression test that fails when the bug is reintroduced | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Compatibility | Existing detector coverage on Bash unchanged | Existing test suite + new both-sides tests |
| Size limits | JS files stay within project thresholds | wc -l after edit |
| Conventions | Conventional Commits, no co-author trailer | git log review |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] All 6 reports have a Fix + Verification section filled with real probe output
- [ ] Project test suite passes
- [ ] Reports moved to `bug_reports/completed/` with `.completed` marker
- [ ] CHANGELOG.md updated (unreleased heading)
- [ ] Changed lib/scripts files synced into the installed plugin directory

### 4.2 Quality Criteria

- [ ] Zero lint errors on touched files
- [ ] No protection regression in destructive-detector (both-sides tests green)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `targetFields` on G-001 weakens detection | High | Low | Both-sides regression tests; Bash surface keeps full coverage |
| Archive-gate relaxation lets incomplete cycles archive | High | Low | Require phase ≥ report AND all 4 docs on disk — docs-on-disk is ground truth |
| Orphan cleanup deletes a live feature's row | Medium | Low | Cleanup only fires when docs are provably absent at canonical paths |
| Installed-plugin sync diverges from repo | Medium | Medium | Sync is a file copy of exactly the changed files; record the sync manifest in the report |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/control/destructive-detector.js` | Code | Add `targetFields` to G-001 (and audit G-013) |
| `lib/pdca/lifecycle.js` | Code | Archive status write must survive doc move |
| `lib/pdca/feature-manager.js` / `status-cleanup.js` | Code | Orphan-row sanctioned cleanup |
| `scripts/gap-detector-stop.js` / `lib/pdca/status-core.js` | Code | Feature resolution + table-form matchRate parsing |
| `scripts/pdca-archive.js` | Code | Docs-on-disk gate relaxation |
| StopFailure handler (stop/failure parsing path) | Code | Real field extraction |
| `CHANGELOG.md` | Docs | Unreleased entry |
| Installed plugin at `~/.claude` | Deploy target | Copy of changed files |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| destructive-detector | detect() | `scripts/pre-write.js`, `unified-bash-pre.js` | None — Bash coverage preserved |
| updatePdcaStatus | WRITE | `lib/pdca/lifecycle.js` archiveFeature | Fixed call-site only |
| pdca-status registry | READ/WRITE | archive CLI, MCP status, hooks | Cleanup path additive |
| matchRate parser | READ | gap-detector-stop, iterator-stop | Parser widened, not replaced |

### 6.3 Verification

- [x] Consumers listed above identified via report evidence (file:line cites in each report)
- [ ] All consumers re-verified after fixes (Check phase)

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

bkit is itself the project — a Node.js plugin, not a web app. Standard repo conventions apply (lib/ + scripts/ + hooks.json); the web-oriented level table is not applicable.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Fix granularity | One feature per bug / one wave feature | One wave feature | Same enforcement/bookkeeping subsystem; 6 small orthogonal fixes; loop-driven |
| Gate relaxation basis | matchRate presence / docs-on-disk | Docs-on-disk + phase ≥ report | Reports show registry bookkeeping is the unreliable half; disk is ground truth |
| Orphan cleanup mechanism | Auto-prune / sanctioned CLI | Sanctioned path in existing cleanup/archive CLI | Keeps G-020 registry lockdown intact |

### 7.3 Implementation Surfaces

```
lib/control/destructive-detector.js   (G-001/G-013 targetFields)
lib/pdca/lifecycle.js                 (archive write order/gate)
lib/pdca/feature-manager.js           (orphan rows)
lib/pdca/status-cleanup.js            (orphan rows)
lib/pdca/status-core.js               (extractFeatureFromContext)
scripts/gap-detector-stop.js          (feature resolution, table parse)
scripts/pdca-archive.js               (gate relaxation)
StopFailure parsing path (located in Do phase)
tests/ (new regression tests per fix)
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `.claude/CLAUDE.md` — language rules (English code/docs; bilingual `.en.md`/`.ko.md` for NEW `docs/` files), versioning freeze
- [x] Conventional Commits, no co-author trailer
- [x] Bug-report 9-field template

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| Bilingual docs | `.en.md`/`.ko.md` siblings required for new docs/ files | Apply to analysis/report docs of this feature | High |
| File size | JS ≤ project thresholds | Split if exceeded | High |

---

## 9. Next Steps

1. [ ] Design document (`bugfix-wave-20260919.design.md`, en+ko)
2. [ ] Do phase: implement 6 fixes via subagent dispatch
3. [ ] Check (gap-detector) → Iterate if < 90% → QA → Report → Archive
4. [ ] Sync to installed plugin; CHANGELOG entry; cancel cron when wave complete

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-19 | Initial draft (L4 full-auto wave) | Claude Code |
