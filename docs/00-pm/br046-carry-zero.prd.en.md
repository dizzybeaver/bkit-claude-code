# br046-carry-zero — Defect-Fix PRD (§45.9 Bug-Fix Lane)

**Version:** 1.0 · **Date:** 2026-10-10
**Type:** Minimal defect-fix PRD — product discovery (discovery/strategy/research agents) is N/A for this lane.
**Source of Truth:** this EN file. Korean sibling: `br046-carry-zero.prd.ko.md` (content-synced pair).
**Bug report:** `bug_reports/active/br/br046-g019-blocks-read-only-state-commands.md` (filed; this cycle closes it)

## 1. Executive Summary

| Perspective | Summary |
|---|---|
| Problem | G-019 denies read-only commands that merely mention a broker-state token (observed twice this session); ~35 historical features' phase docs sit unarchived and materialize as phantom active features in the PDCA status view. |
| Solution | W1: structured read-use exemption in `detect()` beside the `docTargetExempt` precedent. W2: scripted janitorial archival batch (dry-run → apply) with a registry safety exclusion. |
| Function/UX Effect | Legitimate backup/read probes pass the guard; the `getPdcaStatusView` active list shrinks to real features. |
| Core Value | Zero carry-over: br046 closes, the guard keeps full write-deny authority, phantom features disappear. |

## 2. Background

Operator directive (30m carry-zero loop): eliminate ALL carry-over — fix in-scope/pre-existing
issues immediately, file out-of-scope findings as bug reports, close every report old or new.
Two work items define this cycle:

- **W1 — br046 (already filed).** G-019 at `lib/control/destructive-detector.js:401-432` denies
  read-only commands that merely mention a broker-state token. Observed twice this session:
  (1) `cp` with the state file as SOURCE (a backup read); (2) `node -e` with the token inside a
  quoted read call. The pattern cannot distinguish token-as-source from token-as-destination,
  nor read calls from write calls inside interpreter payloads.
- **W2 — historical doc archival.** ~35 features' phase docs (43 plan / 36 design / 19 analysis /
  74 report files under `docs/{01-plan,02-design,03-analysis,04-report}/features/`) are unarchived;
  `getPdcaStatusView` materializes them as phantom active features.

## 3. Problem Statement

A CRITICAL guard over-claims: any command text containing a write-class verb within 4000 chars of a
`.bkit/state` / `pdca-status` token is denied regardless of read vs write intent — causing backup
failures, rephrase round-trips, and alarm fatigue that erodes the guard's authority. In parallel,
doc-evidenced-but-never-run features pollute the active view, breaking the invariant that the
status view reflects registry-tracked work only.

## 4. Scope

**IN**
- W1: G-019 read-use exemption in `detect()` (cp/mv source-position check; interpreter
  read-call-context check) + regression vectors keeping every write shape denied.
- W2: scripted batch archival of historical feature docs to `docs/archive/<YYYY-MM>/<feature>/`
  (era = doc mtime), with dry-run → apply, bilingual siblings together, `_INDEX.md` updated,
  and a registry-based safety exclusion.

**OUT**
- Modifying G-019's core regex semantics beyond the exemption (the br102/round-10 under-claim
  patch stays intact).
- Touching archived history — the move is content-preserving; no document edits.
- Registry writes (G-020 denies agent writes; the exclusion check is read-only at Do time).
- Test execution, commits, or phase advancement by the Do agent (MAIN owns all of these).

## 5. Requirements

### R1 — G-019 structured read-use exemption (W1)

In `detect()` beside the existing `docTargetExempt` precedent (~:1540 area), applied ONLY to G-019
when `stateGuard` is set:
1. **cp/mv token-as-source positional check** — tokenize the command; exempt only when every
   occurrence of the token is strictly before the final path argument (the token is never the
   destination) AND no `>>` / `tee` / `-o` / `of=` write form exists.
2. **Interpreter read-call-context check** — for `node|python3?|perl`: exempt only when the token
   occurs exclusively inside quoted segments containing a read-call marker
   (`readFileSync|readFile|createReadStream|statSync|accessSync`) within ~60 chars before the token,
   AND the whole command contains no write-call marker
   (`writeFileSync|appendFileSync|writeFile|openSync|>\s*'|sort -o|tee `).
   Any write marker anywhere → still deny.

MUST keep denying (red-team vectors): token as cp/mv destination; `writeFileSync` payloads;
`sort -o`; glob spellings; redirect vectors. The PDCA_GUARD_REDTEST suite must stay green.

### R2 — Scripted historical-doc archival (W2)

Mechanical batch (~170 files) — per the automate-repetitive-work rule, script it; do NOT hand-move:
1. Backup the file set first (`tools/cycle_ops backup` pattern or equivalent).
2. Dry-run pass prints the full move plan (source → destination per file) before any mutation.
3. Era per feature = doc mtime → destination `docs/archive/<YYYY-MM>/<feature>/`.
4. Bilingual siblings (`.en.md` / `.ko.md`) move together.
5. `_INDEX.md` in each moved-from directory is updated.
6. Safety exclusion at Do time: EXCLUDE any feature present in the registry dict as non-archived.

### R3 — Post-state invariant

After both work items, the PDCA status view's active list contains ONLY registry-tracked
non-terminal features plus this cycle (`br046-carry-zero`). No phantom doc-evidenced features remain.

## 6. Success Criteria

- **SC-1 (W1 gates).** `cp .bkit/state/pdca-status.json /tmp/x` → ALLOWED;
  `cp /tmp/x .bkit/state/pdca-status.json` (token as destination) → DENIED;
  `node -e "...writeFileSync(...)"` payload → DENIED; PDCA_GUARD_REDTEST vector suite → green.
- **SC-2 (W2 gates).** `docs/{01-plan,02-design,03-analysis,04-report}/features/` empty (or holding
  only excluded actives); `getPdcaStatusView` phantom count = 0.
- **SC-3 (contract battery).** The 24-step contract-check battery is green, including the
  docs-code-sync steps (battery steps 9/21).

## 7. Risks

| Risk | Mitigation |
|---|---|
| Exemption over-broad → real writes slip through | Red-team vectors (the original REDTEST set) gate the fix; the any-write-marker-anywhere rule forces deny. |
| Doc moves break docs-code-sync count contracts | The contract-check battery steps 9/21 catch count drift; run the battery after apply. |
| Stale references to moved docs (loops, index files) | `_INDEX.md` updated in the same apply; sweep references during dry-run review. |

## 8. Non-Goals

- No product discovery, personas, market sizing, or GTM content — N/A for the bug-fix lane.
- No changes to G-019 beyond the scoped exemption; no weakening of any other guard.
- No content edits to archived documents; the move is content-preserving.
- No registry mutation, test execution, or commits by the Do agent — hand off to MAIN.
