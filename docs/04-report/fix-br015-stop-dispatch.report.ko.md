# fix-br015-stop-dispatch 완료 보고서

**Date:** 2026-09-27
**Cycle:** bug-fix PDCA (work.md §45.9): pm→plan→design→do→report→archive
**Source:** br015 (High)

## 요약 (Executive Summary)

| Perspective | Content |
|-------------|---------|
| **Problem** | `session.lastSkill` was read by the Stop dispatcher (unified-stop.js) but written by nothing — the pdca Stop handler was unreachable in fork-mode sessions, dead-ending every in-handler advance (report→completed, envelope derivation). |
| **Solution** | Writer at fire time (skill-invocation-effects.js step-6 session block, sanctioned status API), reader normalization (`normalizeSkillName` from lib/core/skill-name.js strips `bkit:` → SKILL_HANDLERS key), 4-test regression suite. |
| **Function/UX Effect** | Stop events route to per-skill handlers again; probe proved the full chain: seeded registry `lastSkill=bkit:pdca` → survives load → `activeSkill=pdca` → `Executing skill handler` → `handled:true`. |
| **Core Value** | Closes the root of the br009/br011/br014 Stop-advance family; future cycles' report→completed advance works deterministically, not by luck. |

### 1.3 전달된 가치

- 3 layers diagnosed across the family: findDoc bilingual defaults (wave 1), handler action derivation (br014), dispatch reachability (br015 — this wave).
- Verified: regression suite 4/4; jest 34/34; battery OVERALL PASS 11/11 (check K SKIP as designed); live end-to-end spawn probe green.

## 핵심 의사결정 및 결과

| Decision | Followed? | Outcome |
|----------|-----------|---------|
| Option A minimal-change (extend existing write site + normalize at single read) | Yes | 2 source files + 1 test; no new modules |
| Writer via sanctioned `getPdcaStatusFull(true)`→mutate→`savePdcaStatus()` (never raw file writes; G-019/G-020 safe) | Yes | Fire-time effect wrapped in try/catch so session recording can never break skill fires |
| Normalization via SSoT `normalizeSkillName()` (lib/core/skill-name.js), not a local regex | Yes | `'bkit:pdca'→'pdca'`, `'pdca'→'pdca'`, `'x:y'→'y'` |
| Dual-mode JSON contract for tests (L2-004/L2-006 lessons) | Corrected | Test (c) initially asserted a contract unified-stop doesn't have (plain-text stdout); fixed to assert the debug-trace dispatch observable + real fixture schema (`version`, not `schemaVersion`) |

## 성공 기준 최종 상태

| Criterion | Status | Evidence |
|-----------|--------|----------|
| FR-01 fire persists `session.lastSkill` | ✅ Met | writer test green; fire-time effects run in hook process from synced cache |
| FR-02 `session.lastAgent` written symmetrically | ✅ Met | writer test green (`invocationArgs.agent \|\| subagent_type`) |
| FR-03 reader strips plugin prefix | ✅ Met | reader spawn test green; probe shows `activeSkill: pdca` |
| FR-04 chain test fire→registry→handler | ✅ Met | chain test green; live probe `handled:true` |
| Full battery green | ✅ Met | OVERALL PASS 11/11 (K SKIP by design) |
| br015 closed + wave archived | ⏳ | closure in progress at report time |

## 프로세스 노트 (솔직한 기록)

- Implementation agent #1 (br015-impl) killed at deadline: 25 min, 4.4M input tokens, zero edits. Operator directive lowered the default dispatch deadline 20m → 10m (work.md updated).
- Replacement (br015-impl2) landed all 3 files but overran the new 10m deadline (103 min wall — enforcement gap, see work/brfix-wave-status.md) and missed test (c) once; MAIN finished that scope in-session per the 2-strike rule.
- Post-reboot, `Skill(bkit:pdca)` returned "Unknown skill" 3× — filed as br017; report phase advanced via skill re-fire after plugin cache sync.
- Registry anomaly `ZfeatA` (foreign feature at plan phase, not started by this session) observed — not touched (registry hand-edits banned); flagged for operator.
