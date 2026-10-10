# br046-carry-zero Planning Document

> **Summary**: Close both carry items — G-019 read-only false-positive exemption (br046) and scripted archival of ~35 doc-evidenced historical features — leaving zero carry-over.
>
> **Project**: bkit-claude-code (v2.1.40) · **Author**: dizzybeaver (main session) · **Date**: 2026-10-10 · **Status**: Draft
> **Lane**: §45.9 bug-fix cycle · **Directive**: 30m operator loop (job b82a8598) — no findings left as notes

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | G-019 denies read-only commands naming a broker-state path (2 live false-positives today); ~35 historical features' phase docs sit unarchived, materializing as phantom active features in every status view. |
| **Solution** | Structured read-use exemption in detect() beside docTargetExempt (cp/mv source-position + interpreter read-call-context, any-write-marker → deny); scripted dry-run→apply archival of the doc sets to docs/archive/YYYY-MM/. |
| **Function/UX Effect** | Backups and API readbacks work unblocked; the status view lists only real registry features. |
| **Core Value** | Zero carry-over: both "note for later" items become fixed-and-verified. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Operator directive: resolve everything, no carry items; br045 cycle left exactly 2. |
| **WHO** | Maintainer, dispatched agents (G-019 hits them hardest), dashboards. |
| **RISK** | Exemption over-breadth weakening a CRITICAL guard — gated by mandatory red-team vectors; doc moves breaking count contracts — gated by battery steps 9/21. |
| **SUCCESS** | SC-1 allow/deny matrix + REDTEST green; SC-2 features dirs empty + phantom count 0; SC-3 24-step battery green. |
| **SCOPE** | 1 lib file + exemption vectors suite; 1 archival script run (~170 files); no G-019 regex semantics change. |

---

## 2. Scope

### 2.1 In Scope
- [ ] R1: `stateReadExempt` in detect() (destructive-detector.js) — cp/mv token-as-source positional check; interpreter read-call-context check; any-write-marker-anywhere → deny; G-019-only
- [ ] R2: regression vectors for the exemption (allow: cp-source, node read-string; deny: cp-dest, writeFileSync payload, sort -o, redirects, globs) + existing REDTEST suite stays green
- [ ] R3: archival script (tools/ or scripts/) — inventory → exclude registry-active features → dry-run plan → apply (mv to docs/archive/YYYY-MM/ by mtime era, bilingual siblings together, _INDEX.md update)
- [ ] R4: post-state readback (features dirs empty; view phantom count 0)

### 2.2 Out of Scope
- G-019 pattern semantics beyond the exemption; G-020; archived-history edits; view materialization logic itself

---

## 3. Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | stateReadExempt: (a) tokenize command; every broker-token occurrence in a cp/mv must be strictly before the final path arg AND no `>>`/`tee`/`-o`/`of=` form anywhere → exempt; (b) node/python3/perl: token only inside quoted segments with a read-call marker (`readFileSync\|readFile\|createReadStream\|statSync\|accessSync`) within 60 chars before it AND zero write-call markers (`writeFileSync\|appendFileSync\|writeFile(\|openSync)`) in the whole command → exempt; exemption applies ONLY to rule G-019 (not G-020) | High | Pending |
| FR-02 | Vectors suite (new or extended): the 2 FP shapes allow; ≥5 deny shapes still deny (incl. all original PDCA_GUARD_REDTEST vectors) | High | Pending |
| FR-03 | Archival script with mandatory dry-run default + backup; safety exclusion = features present in registry as non-archived; era from plan-doc mtime | High | Pending |
| FR-04 | node --check all touched JS; no direct registry writes; no commits (MAIN owns) | High | Pending |

---

## 4. Success Criteria

- [ ] SC-1: `cp .bkit/state/pdca-status.json /tmp/x` ALLOWED; `cp /tmp/x .bkit/state/pdca-status.json` DENIED; `node -e "…writeFileSync('.bkit/state/pdca-status.json'…)"` DENIED; vectors suite + REDTEST green
- [ ] SC-2: `ls docs/{01-plan,02-design,03-analysis,04-report}/features/` empty (or only registry-excluded actives — expect none); view active = registry-tracked + this cycle only
- [ ] SC-3: 24-step contract-check battery green (docs-code-sync steps prove count contracts survived the moves)
- [ ] Report + archive complete; br046 closed per catalog procedure

---

## 5. Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Exemption too broad | High | Medium | FR-02 deny vectors gate; red-team review of the diff |
| Doc moves break docs-code-sync / component-inventory counts | Medium | Medium | Battery steps 9/21/3 catch; fix counts in same cycle |
| Moved docs break wiki-links from live docs | Low | Medium | Battery + spot grep for links into features/ dirs |

---

## 7. Architecture — Option A + scripted batch (per automate-repetitive-work)

## 9. Next Steps
1. [x] PRD 2. [ ] Design 3. [ ] Do (scoped agent, 10-min deadline) 4. [ ] MAIN SC-1..3 5. [ ] Report + archive + close br046

---

## Version History

| 0.1 | 2026-10-10 | Initial draft | dizzybeaver |
|-----|------------|---------------|-------------|
