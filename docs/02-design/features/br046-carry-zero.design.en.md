# br046-carry-zero Design Document

> **Summary**: Exact designs — the stateReadExempt seam (beside docTargetExempt at detect() line ~1313), the vectors suite, and the archival script (dry-run default).
>
> **Project**: bkit-claude-code (v2.1.40) · **Date**: 2026-10-10 · **Status**: Draft
> **Planning Doc**: [plan](../../01-plan/features/br046-carry-zero.plan.en.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Operator directive: zero carry-over; br046 + doc-evidence phantoms are the last 2. |
| **WHO** | Maintainer, dispatched agents, dashboards. |
| **RISK** | Exemption over-breadth (gated by deny vectors); doc moves break count contracts (gated by battery). |
| **SUCCESS** | SC-1 allow/deny matrix + REDTEST green; SC-2 features dirs empty + phantoms 0; SC-3 battery green. |
| **SCOPE** | 1 lib file + vectors; 1 script + ~170 doc moves. |

---

## 2. Architecture — Option A (+ scripted batch)

### W1: stateReadExempt (lib/control/destructive-detector.js)

Verified facts: `detect()` rule loop exempts via `if (docTargetExempt && rule.stateGuard) continue;` (line ~1313); commands are segmented (`splitCommandSegments`, ENH-440); G-019 has `stateGuard: true`; G-020 is a separate rule with its own patterns.

Design:
1. New helper `isStateReadUse(segment)` — operates on ONE command segment:
   - Tokenize on whitespace (after heredoc-strip, already done upstream).
   - Broker-token regex: `/(\.bkit[\/\\]\s*state|pdca[-_]?status)/i`.
   - **cp/mv clause**: if segment's first verb is cp or mv → collect path args; if EVERY broker-token occurrence is among args strictly before the final path arg AND segment has no `>>|<<|tee |-o |of=` forms → return true.
   - **interpreter clause**: if first verb is node/python3/python/perl → find broker-token occurrences; each must lie inside a quoted region that contains a read-call marker (`readFileSync|readFile|createReadStream|statSync|accessSync`) within 60 chars BEFORE the token; AND the whole segment contains NO write-call marker (`writeFileSync|appendFileSync|writeFile\s*\(|openSync\s*\([^)]*['"]w`) → return true. Otherwise false.
   - Any write-form (`>>`, `tee`, `sort -o`, `dd of=`, `truncate`, `chmod`, `rm` with token) anywhere in the segment → false regardless.
2. In the rule loop, beside docTargetExempt: `if (rule.id === 'G-019' && stateReadExempt) continue;` — G-019-ONLY (G-020 unaffected), computed per segment like ENH-440 segmentation (the G-019 matcher runs on segments; the exemption must be evaluated on the same segment that matched, not the whole input).
3. Comment citing br046 with the two live FP transcripts.

### W1 vectors (test/unit/destructive-detector-readexempt.test.js — node:test style, or extend the existing REDTEST-style suite):

ALLOW: `cp .bkit/state/pdca-status.json /tmp/x` · `cp --parents a b .bkit/state/pdca-status.json work/backups/x/` · `node -e "const s=require('fs').readFileSync('.bkit/state/pdca-status.json','utf8');console.log(s.length)"`.
DENY: `cp /tmp/x .bkit/state/pdca-status.json` · `node -e "require('fs').writeFileSync('.bkit/state/pdca-status.json','{}')"` · `echo x >> .bkit/state/pdca-status.json` · `sort .bkit/state/x -o .bkit/state/x` · `cat y | tee .bkit/state/pdca-status.json` · `rm .bkit/state/pdca-status.json` · `python3 -c "open('.bkit/state/pdca-status.json','w')"` (openSync/open with 'w' is a write marker) · the existing PDCA_GUARD_REDTEST vectors (suite must stay green unchanged).

### W2: archival script (tools/doc-archive/archive-features.js)

1. Inventory: glob docs/{01-plan,02-design,03-analysis,04-report}/features/*; group by feature name (strip `.plan|.design|.analysis|.report` + `.en|.ko` suffixes).
2. Safety exclusion: skip features whose name exists in `getPdcaStatusFull().features` with phase NOT in {archived, completed} — read via the API (lib/pdca), never the file.
3. Era: `YYYY-MM` from the feature's oldest doc mtime.
4. Dry-run default: print the full move plan (feature → era dir, file list). `--apply`: git mv each file to `docs/archive/<era>/<feature>/`, then append a row per feature to `docs/archive/_INDEX.md` (create if absent, format matching existing rows).
5. Post: print summary (features moved, files moved, excluded list).

## 8. Test Plan (MAIN-executed)

| Check | Method |
|-------|--------|
| SC-1 | run the vectors suite + the existing REDTEST suite + 3 inline node probes (allow cp-source, deny cp-dest, deny writeFileSync payload) |
| SC-2 | `ls docs/{01-plan,02-design,03-analysis,04-report}/features/` + view readback: active = registry-tracked + this cycle |
| SC-3 | 24-step contract-check battery (steps 9/21 prove docs-code-sync survived) |

## 11. Implementation Order

W1 detector + vectors → node --check → W2 script → script dry-run (report plan to MAIN) → MAIN reviews plan → `--apply` → readbacks. One agent, both work items, exclusive scope: lib/control/destructive-detector.js, the new vectors file, tools/doc-archive/.

## Version History

| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
|-----|------------|---------------|-------------|
