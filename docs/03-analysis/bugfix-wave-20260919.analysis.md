# bugfix-wave-20260919 Gap Analysis (Check Phase)

**Feature:** bugfix-wave-20260919 · **Date:** 2026-09-19 · **Phase:** check · **Overall Match Rate: 94%**

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | Gate/hook defects block legitimate work — enforcement layer failing its own users. |
| WHO | bkit users running agent-orchestrated PDCA cycles; the enforcement layer itself. |
| RISK | Detector changes weakening real protection; gate relaxation admitting incomplete cycles. |
| SUCCESS | All 6 reports verifiably fixed (regression tests), CHANGELOG written, installed plugin synced. |
| SCOPE | 6 fixes: G-001/G-013 targetFields, archive write order, orphan-row cleanup, matchRate recording + gate relaxation, feature resolution, StopFailure parsing. |

## Axis Scores

| Axis | Score | Evidence |
|------|-------|----------|
| Structural | 98% | All 6 design fixes map to real changes at named anchors (targetFields lines 43/259; requireDocs:false line 155; orphan path lines 43-68; parseMatchRate/extractFeatureFromText/isKnownFeature; 3-clause gate; parseFailurePayload) |
| Functional Depth | 92% | Real logic matching design; deductions: string-form Write residual FP path untested; undesignated behaviors (gate upper bound, archivedAt merge) |
| Contract | 95% | 5 new suites assert every design behavior; 48 new TCs; full battery 1980/1980 |
| **Overall (0.2S+0.4F+0.4C)** | **94%** | Above the 90% gate — proceed to QA |

## Structural Detail

| Fix | Site | Verdict |
|-----|------|---------|
| 1 G-001/G-013 targetFields | lib/control/destructive-detector.js:43,259 | ✅ |
| 2 requireDocs:false | lib/pdca/lifecycle.js:155 | ✅ |
| 3 orphan cleanup | lib/pdca/status-cleanup.js:43-68 | ✅ |
| 4 parser + guard | scripts/gap-detector-stop.js:74,150-163 | ✅ |
| 4 archive gate | scripts/pdca-archive.js:125,139 | ✅ (deviation: +phase<archived upper bound — stricter than design, safe) |
| 5 StopFailure payload | scripts/stop-failure-handler.js:170-179 | ✅ |

## Deviations

| # | Severity | Item | Assessment |
|---|----------|------|-----------|
| 1 | Minor | Gate adds `phase < archived` upper bound (not in design) | Stricter, fail-closed harder — accepted |
| 2 | Minor | New 'exit_code' category in classifyError (not in design) | Required to make 'Exit code 2' non-unknown; tested — accepted |
| 3 | Minor | String-form Write input still whole-input-matches (residual FP path) | Out of design test scope; filed as follow-up candidate (RB class, sibling of RB-003 residual) |
| 4 | Minor | Fix-1 tests in standalone file vs additions | Equivalent coverage, matches sibling pattern — accepted |
| 5 | Minor | archivedAt dropped by updatePdcaStatus merge (pre-existing) | Filed as br003; out of scope this wave |

## Plan Success Criteria (code-side)

- FR-09 regression test per fix: ✅ (5 suites, one per fix cluster)
- Lint: post-edit quality hooks ran during Do; not re-verified in this static analysis (noted plainly)

## Decision

matchRate 94% ≥ 90% gate → proceed to QA phase. No iteration required. Residual minor items tracked (deviation 3 → follow-up RB candidate; deviation 5 → br003).
