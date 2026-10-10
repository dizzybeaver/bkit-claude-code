# br045-close-registry-junk — Defect-Fix PRD

**Version:** 1.0 · **Date:** 2026-10-10
**Lane:** §45.9 bug-fix/janitorial (minimal PRD) · **SoT:** this `.en.md` file; KO sibling is a translation

## Executive Summary

Two janitorial debts from the br045 cycle, both verified 2026-10-10: (1) the br045 bug report is
fixed and verified (commit 9c599e8) but never went through the documented closing procedure, so it
still sits open in `bug_reports/active/br/`; (2) `.bkit/state/pdca-status.json` carries 8 junk rows
in `activeFeatures` — 5 entries failing feature-name validation and 3 June-2026 test-fixture
orphans. Both close via sanctioned paths only: the bug-report closing procedure and the two
exported `lib/pdca` registry APIs. No hand-edits to the registry; no new tooling. This cycle is
BUILD ONLY — MAIN executes all verification.

## Product Discovery

**N/A** — §45.9 defect-fix/janitorial lane. Personas, market sizing, OST, lean canvas, and GTM do
not apply to report-filing and registry cleanup work.

## Background

- br045 (scope-limiter L0 poisoned control state) was fixed and verified in the
  `fix-br045-scope-advisory-fixes` cycle: commit 9c599e8; SC-1 level coherence 4→4 across full
  battery; SC-2 probes 4/4; SC-3 all 24 contract-check steps green; qa-aggregate 7179/0/0; plugin
  cache synced. `bug_reports/active/br/br045-scope-limiter-l0-poisoned-control-state.md` never went
  through the closing procedure in `bug_reports/instructions.md`, so it remains open (Open row in
  `active/br/INDEX.md`).
- `.bkit/state/pdca-status.json` carries 8 junk rows in `activeFeatures`:
  - 4 `fix-br060-065-audit-pdca` long-name variants — a whole-prompt-string was captured as the
    feature name; the real short-name cycle is properly archived.
  - `ZfeatA` — battery-fixture junk.
  - `test-feature`, `test-feature-sync`, `test-module-chain` — June 2026 fixture debris (active +
    non-terminal + no plan/design docs on disk = BR-001 sanctioned orphan path).
- Registry writes go ONLY through exported `lib/pdca` APIs (locked RMW, br030); hand-editing the
  JSON is banned (G-020 analogue). Both APIs are required exports of `lib/pdca` (`index.js`
  re-exports): `cleanupOrphanActiveFeatures()` and `deleteFeatureFromStatus(name)`.

## Problem Statement

1. **Debt 1 — br045 report open-but-fixed.** The fix is shipped and verified, but the report's open
   status misstates reality: the open-reports INDEX and directory layout claim an unfixed defect.
   The closing procedure exists for exactly this and was skipped.
2. **Debt 2 — 8 junk registry rows.** Junk `activeFeatures` entries pollute every PDCA status view,
   risk confusing phase readers (primaryFeature, active counts), and misrepresent live work. Each
   entry has a verified, sanctioned removal path; none has been executed.

## Scope

**IN:**
- Close br045 per `bug_reports/instructions.md` "Closing procedure" — 5 steps (R1).
- Remove the 4 `fix-br060-065-audit-pdca` long-name variants + `ZfeatA` via `lib/pdca`
  `cleanupOrphanActiveFeatures()` (R2).
- Remove `test-feature`, `test-feature-sync`, `test-module-chain` via `lib/pdca`
  `deleteFeatureFromStatus(name)` (R3).
- Post-cleanup registry readback: the 8 gone, legitimate rows intact (R4).

**OUT:**
- Archived-feature history rows (legitimate — stay).
- Any new tooling or new lib/pdca functions.
- `/pdca cleanup` of archived summaries.

## Requirements

- **R1 — br045 close procedure.** Execute the full closing procedure, including in-session
  re-verification of the SC probes (SC-1 level coherence, SC-2 probes, SC-3 contract-check) before
  touching the file: append `## Resolution` addendum; `mv` to `completed/BR/br045-...completed.md`;
  remove the `## Open` row from `active/br/INDEX.md`; prepend to `## Recently Closed` as
  `- br045-scope-limiter-l0-poisoned-control-state.completed.md — one-line what-fixed (Medium; closed 2026-10-10, fix-br045-scope-advisory-fixes)`.
- **R2 — orphan-name cleanup.** Call `cleanupOrphanActiveFeatures()` once; capture its result
  (removed names + count) in the report. Expected: the 4 `fix-br060-065-audit-pdca` variants +
  `ZfeatA`.
- **R3 — orphan-feature cleanup.** Call `deleteFeatureFromStatus(name)` for `test-feature`,
  `test-feature-sync`, `test-module-chain`; capture each call's result. If the orphan guard
  refuses any name, report the refusal and stop for that name — do not force.
- **R4 — readback.** After R2+R3, read the registry through the sanctioned view and confirm none
  of the 8 junk names remain and legitimate rows survive.

## Success Criteria

- **SC-1:** `bug_reports/active/br/` contains no br045 file; `completed/BR/br045-*.completed.md`
  exists with a `## Resolution` addendum; INDEX shows br045 only under `## Recently Closed`.
- **SC-2:** Registry readback — none of the 8 junk names present; `br045-scope-advisory-fixes` and
  other legitimate rows intact; `primaryFeature` is a real feature.
- **SC-3:** `pdca status` view loads without error + a hook smoke test passes.

## Risks

- **API refusal:** if the orphan guard in either API disagrees with the classification (e.g. a
  `test-*` name gains a doc), the call refuses. Report the refusal as-is; do not force, do not
  hand-edit the JSON.

## Non-Goals

- No changes to `lib/pdca` code, validation rules, or the registry format.
- No re-verification beyond the br045 SC probes named in R1.
- No cleanup of archived-feature summaries or docs/archive contents.
- No renaming/migrating of any legitimate active feature.
